---
title: 设计决策
description: 为什么 Defjs 把契约、command、传输结果、解码和所有权都摊开。
---

# 设计决策

Defjs 做了几处有意的取舍。方便型 API 常常把「谁拥有请求、流、会话」藏起来。Defjs 把这条边界留在明处，这样你可以复用同一份端点契约，而不会悄悄带上缓存、重试调度器或资源管理器。

## 显式 Client

`createClient(...)` 把 endpoint 配置做成一个明确的值。不同环境或请求作用域，可以有不同的 endpoint、凭证、interceptor、serializer 和 transport handle。

代价是：没有进程级默认 Client。服务端这点反而有用——options 或闭包会抓住鉴权、cookie、用户、租户或请求元数据时，把 Client 建在请求边界里。显式 Client 并不能隔离 interceptor 抓住的状态。Client 身份本身也不是安全边界。

Client 负责分派 command，并不拥有正在进行的工作。谁启动了 HTTP 请求、SSE 流或 WebSocket 会话，谁就要取消或关闭，并 await 终止 promise。

## Definition、builder、command

Definition 是稳定契约：method、path、input Struct、output 映射、传输限制。Builder 是可调用的视图。调用它会打出一次执行用的 opaque command。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

后台任务和 UI 可以共用同一个 `getUser` 形状，但取消/重试策略可以不同。保持 command 不透明，能避免业务代码依赖内部传输标签或 symbol。

## 按传输区分的结果

三种传输都用错误优先 tuple。硬塞成一个泛型「response」会抹掉生命周期事实。

- HTTP → `[error, data, response]` — 解码输出 + `HttpResponse`
- SSE → `[error, stream, open]` — 一条逻辑流 + 启动响应快照
- WebSocket → `[error, session, connection]` — 逻辑会话 + 启动连接快照

第三项是快照，不是「以后重连还是同一条物理连接」的 promise。启动失败时，只要传输先产出了响应/快照，第三项仍可能有值。启动之后，生命周期控制归返回的 handle 或 session。

## 运行时解码

TypeScript 推断只描述你期望什么，拦不住服务端真返回什么。Struct 解析是契约的另一半。Defjs 在构造请求前校验 command 输入，解码选中的表示，再按匹配的 Struct 解析。

这个顺序让状态和 body 保持两件独立事实。精确声明状态的选择发生在 body 解码**之前**。声明过的非 2xx → 类型化 `error.data`。声明过的 body 坏了 → `RESPONSE_VALIDATION_FAILED`。未声明状态 → `UNDECLARED_STATUS`（不是无类型的成功/失败）。比「来啥 JSON 信啥」更严，但你能据此做安全判断。

## `build` 的边界

调用方形状已经是 path/query/headers/body 时，默认走自动 `struct.request(...)` 映射。调用方形状和线上形状不一致时，用受限的 `build(request, input)` 投影：

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` 是 schema 绑定视图，不是调用方手里的运行时对象。投影可以挑声明字段、改名目标、把源数组一项映到输出一项。不能按值分支、注入字面量、改基数。业务数据归一化和依赖取值的校验，放在创建 command 之前。

## Observer 和政策放哪

Interceptor 管传输级政策：鉴权、追踪、短路、审过的重试。它们只跑自己的传输，按洋葱顺序组合。执行 options 管这次工作的寿命：`signal`、`timeout`、WebSocket heartbeat、可选重连。

Observer 只报告发生了什么，不当第二任所有者。SSE 的 `onInvalidEvent`、WebSocket 状态监听、运行时错误监听，适合有界诊断和指标。返回的 stream/session 仍拥有迭代、关闭、退订和等待终止。缓存、过期结果抑制、幂等、领域错误映射，放在 `client.execute(...)` 周围，业务能看见自己的政策和状态。

## OpenAPI、sourcemap、telemetry

Defjs 不会生成或同步第二份 OpenAPI 契约。OpenAPI 已经是权威源时，继续以它为准，在应用边界加运行时校验。新服务可以直接把端点 definition 和 Struct 当线上契约——不必再搞第二真相源。

`withOpenTelemetryServer(...)` 给 Client 加上**出站** Defjs 埋点。它不会初始化 OpenTelemetry SDK。`tracer` 必填，`meter` 可选，三种传输默认开启，WebSocket query 传播默认关闭。操作名保持静态、低基数。传播、hooks、URL、headers、payload、cause、保留策略都当敏感信息审一遍。

Sourcemap 是部署决策，不是 Defjs 行为。带 `sourcesContent` 的公开 map 会暴露源码；隐藏 map 仍含源码和路径；关掉 map 就没了源码级符号化。把私有 map 当可部署的调试产物，配上明确的访问和保留规则。

## 相关配方

- [声明了 404 的 GET](../recipes/get-declared-404.md)
- [用本地 Fetch handle 做测试](../recipes/test-with-handle.md)
