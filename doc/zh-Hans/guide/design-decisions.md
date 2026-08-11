---
title: 设计决策
description: 解释 Defjs 为什么采用显式 client、按 transport 区分的 tuple、执行时生命周期 option、基于投影的 build 和 observer。
---

# 设计决策

本页只解释当前 API 背后的取舍。字段和默认值请查对应的参考页。

## 显式 Client

Defjs 没有进程级默认 client。`createClient(...)` 让所有权在调用点可见，应用也能针对不同 endpoint、凭据、测试或请求作用域创建不同 client。

这种隔离并不绝对。Interceptor 和 option callback 可以闭包引用共享的应用状态，因此两个 client 对象不会自动隔离周围的一切。`setErrorMap(...)` 也是进程级全局设置。服务端 option 或闭包只要包含 request、user、tenant、cookie 或 authorization 数据，就应创建请求作用域的 client。

显式 client 也更容易说明资源所有权，但 client 不是资源管理器。它不会跟踪或释放正在运行的 HTTP 请求、SSE handle 或 WebSocket session。

## 按 Transport 区分 Tuple

所有支持的 command 都返回 error-first 三元素 tuple，但第三项保留各 transport 自己的含义：

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

这样不会把 HTTP response wrapper、SSE 启动 open 快照和 WebSocket 启动 connection 快照硬塞进一个含糊的抽象。第二项也遵循同一原则：HTTP 返回解码后的 data，SSE 返回逻辑 stream handle，WebSocket 返回逻辑 session。

Tuple 让预期内的启动失败保持显式，不强迫应用使用异常控制流。但这不代表任意 interceptor、callback、listener 或不支持的值都绝不会 reject 或 throw。

## 生命周期 Option 属于执行过程

端点定义描述稳定的 wire contract，并拥有 transport queue 上限。取消、timeout、heartbeat 和 reconnect 选择属于真正拥有本次工作的 execution。

HTTP 和 SSE 在执行时接受取消 option。WebSocket 还接受单次执行的 `beforeConnect`、heartbeat、reconnect 和 protocol option。Transport 支持的可复用默认值放在 client option 中；WebSocket incoming/outgoing 容量仍由 endpoint 定义。

这样 command 可以复用。后台任务和交互页面可以用不同生命周期执行同一个 command，不必重新定义 path 或消息 schema。

## `build` 使用投影

自定义 `build(request, input)` 接收由输入 Struct 派生的声明式绑定视图。它拿不到调用方的运行时值。

这个视图记录源字段如何映射到 path、query、headers 和 body。它支持字段投影、显式 wire key 和数组的一对一投影，同时刻意禁止按值分支、任意 transform 和注入字面量投影值。

这项限制让请求构造始终绑定到已声明的 Struct 字段。创建 command 之前，先在应用层完成标准化和业务校验。支持的投影形式见 [Commands](/zh-Hans/core/commands)。

## Observer 不负责控制流

SSE `onInvalidEvent` 只观察被丢弃的 event。它抛出的错误和返回的 rejected promise 会与 stream 控制流隔离，后续处理仍会继续；不过 async observer 依然会被等待，因此可能拖慢后续消息。

WebSocket state 和 runtime-error listener 也是 observer。它们抛出的错误和 rejected promise 会被隔离：state listener 失败会转发给 runtime-error listener，runtime-error listener 失败会在可用时交给全局 `reportError`，其余 listener 和生命周期工作仍会继续。

生命周期决策应使用返回的 handle 或 session。Observer 只适合做有界日志、指标或状态更新；所有者释放时要移除它们。

## Sourcemap 部署

必须显式选择 production sourcemap 策略：

- **public**：随 bundle 公开部署 map。Map 包含 `sourcesContent`；即使 source path 是相对路径，应用和依赖源码仍可被公开获取。

- **hidden**：只移除 bundle 中的 source-map 引用；应把 map 私下上传到错误平台，且不得公开部署。Map 文件本身仍包含敏感 path 和 `sourcesContent`，“hidden” 不代表安全。

- **disabled**：不生成 production map。这样不会泄露 map，但会牺牲 production stack 的源码级符号化能力，调试更困难。

私有 map 的访问和保留期限应像其他调试产物一样受限。相对路径本身不是保密边界。

## OpenAPI 边界

只选择一个权威 contract source。已有组织级 OpenAPI workflow 时，应继续使用成熟的 mature generator，并在应用边界显式配置 runtime validator；仅生成 TypeScript type 并不能进行运行时 response 校验。Greenfield Defjs service 则直接使用 Defjs Struct 和 endpoint definition 描述 wire contract。

Core 不会新增 OpenAPI generator/exporter，也不会把 OpenAPI 和 Defjs 维护成需要同步的双源。Dual-source drift 比在清晰边界组合成熟工具更糟。

## 相关参考

- [Client](/zh-Hans/core/client)：option 组合和 client 作用域。
- [Errors](/zh-Hans/core/errors)：tuple failure 和 response 可用性。
- [SSE](/zh-Hans/core/sse) 与 [WebSocket](/zh-Hans/core/web-socket)：逻辑 handle、物理连接尝试和终止关闭。
