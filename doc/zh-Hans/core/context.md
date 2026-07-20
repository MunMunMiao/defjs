---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# 上下文

Defjs 执行流程：客户端配置提供全局默认值；命令定义描述端点结构；`build` 将解析后的输入映射到 HTTP 请求各部分；`HttpContext` 则是在单次执行生命周期中，于拦截器之间传递的“隐形行李”。

## HttpContext 传递

`HttpContext` 是一个基于 Token 的键值容器，用于在单次请求/连接生命周期中存储元数据。它不参与 URL、请求头或请求体的序列化。由拦截器读取和写入。

### 创建和使用

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. 定义 Token（带默认值）
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. 创建上下文并设置值
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. 在执行时传递
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### 在拦截器中读取

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### 合并上下文

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged 同时包含 requestId 和 auth
```

### 核心 API

| 导出                                             | 说明                                                |
| ------------------------------------------------ | --------------------------------------------------- |
| `makeHttpContextToken<T>(defaultValue: () => T)` | 创建带默认值的 Token                                |
| `makeHttpContext()`                              | 创建空上下文                                        |
| `makeHttpContext(entries)`                       | 从 `[token, value]` 数组创建                        |
| `makeHttpContext(otherContext)`                  | 复制另一个上下文                                    |
| `mergeHttpContexts(primary, secondary)`          | 合并两个上下文；secondary 对相同 Token 覆盖 primary |
| `ctx.set(token, value)`                          | 写入值；返回自身（可链式调用）                      |
| `ctx.get(token)`                                 | 读取值；未设置时返回 Token 默认值                   |
| `ctx.has(token) / ctx.del(token)`                | 检查 / 删除                                         |
| `ctx.keys() / ctx.length`                        | 迭代 / 计数                                         |

---

## 请求构建器和输入解析

### 输入解析流程

执行命令时，客户端按以下顺序处理输入：

1. **验证**：使用 `input` Struct 验证并解析调用方的原始数据。
2. **构建**：当存在自定义 `build` 时，调用 `build(request, parsedInput)` 将解析后的数据映射到请求各部分。
3. **传输**：根据命令对应的传输类型分发到 HTTP fetch、SSE 流或 WebSocket 连接。

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### 构建处理器能力矩阵

不同传输协议支持不同的 `build` 操作：

| 构建方法                                  | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |

在 `build` 中使用传输协议不支持的方法会在执行时抛出 `REQUEST_VALIDATION_FAILED`。

`withCredentials(...)` 属于客户端级配置，不是公开的 `build` 上下文方法。当前运行时测试也确认 SSE 可以通过客户端级 `withCredentials(true)` 工作。

### 自动构建

即使省略 `build`，只要 `input` 使用的是 `struct.request(...)`，仍然可以提供 `input`，由 Defjs 自动把解析后的 `path` / `query` / `headers` / `body` section 映射到出站请求：

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.string().optional() }),
  }),
  // 无需 build；框架自动映射 path/query
})
```

当提供 `build` 时，必须同时提供 `input`。但如果不提供 `build`，只要 `input` 是 `struct.request(...)` 形状，仍然允许直接依赖框架自动构建请求。

---

## 客户端配置

使用 `createClient` 和一个或多个配置函数创建客户端。后续函数对相同键会覆盖前面的函数。

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### 核心选项

#### `withEndpoint(url)`

设置基础 API 地址。所有请求的 `path` 都拼接在该 URL 之后。

```typescript
withEndpoint('https://api.example.com/v1')
// 请求 /users 会生成 https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

是否包含跨域凭证（cookie、HTTP 认证请求头、TLS 客户端证书）。对应 `fetch` 的 `credentials` 选项。

```typescript
withCredentials(true) // 在跨域请求中携带 cookie
withCredentials(false) // 默认值
```

#### `withXSRF(options)`

配置 XSRF 令牌读取和注入行为。默认从 `document.cookie` 读取 `XSRF-TOKEN` 并注入到 `X-XSRF-TOKEN` 请求头。

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // 自定义读取逻辑，例如从 localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| 字段            | 类型                                   | 默认值                    |
| --------------- | -------------------------------------- | ------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`            |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`          |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | 从 `document.cookie` 读取 |

#### `withQueryParamsSerializer(fn)`

自定义查询参数序列化。默认为 `URLSearchParams.toString()`。

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

提供自定义序列化器后，HTTP 和 SSE 请求支持复杂查询参数。

---

## 传输协议专属配置

### SSE 选项

通过 `withSSEOptions` 或独立的配置函数进行配置。

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| 选项                 | 说明                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `sse.fetch`          | SSE 专属 `fetch` 实现                                              |
| `sse.reconnect`      | 重连策略：重试次数、延迟、退避乘数、抖动、最大延迟、自定义决策函数 |
| `sse.queue`          | 事件队列：最大容量、溢出策略                                       |
| `sse.onInvalidEvent` | 无效事件观察者（缺少结构或验证失败）                               |
| `sse.maxBufferSize`  | 底层缓冲区大小限制（字节）                                         |

### WebSocket 选项

通过 `withWebSocketOptions` 或独立的配置函数进行配置。

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| 选项                      | 说明                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `webSocket.WebSocket`     | 自定义 `WebSocket` 构造函数                                        |
| `webSocket.protocols`     | RFC 6455 子协议数组                                                |
| `webSocket.beforeConnect` | 连接前钩子（例如获取动态令牌）                                     |
| `webSocket.heartbeat`     | 心跳：间隔、超时、消息工厂、ACK 判断函数                           |
| `webSocket.reconnect`     | 重连策略：重试次数、延迟、退避乘数、抖动、最大延迟、自定义决策函数 |
| `webSocket.queue`         | 发送队列：最大容量、溢出策略                                       |

### 心跳详情

WebSocket 心跳检测连接活性。配置后，框架按 `intervalMs` 发送心跳消息，并在 `timeoutMs` 内等待 ACK。如果 ACK 超时，将触发重连。

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // 每 30 秒发送心跳
  timeoutMs: 10000, // 必须在 10 秒内收到 ACK
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- 心跳消息类型必须与 `outgoing` 定义兼容。
- `isAck` 判断一条入站消息是否为心跳响应。返回 `true` 时，该消息不会进入 `receive` 迭代器。

---

## 配置组合与优先级

配置函数按顺序应用；后续覆盖前面。执行时选项（`client.execute(cmd, { timeout: 5000 })`）优先级最高，其次是客户端级配置。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 }))

// 用更靠后的客户端配置覆盖更早的默认值
const clientWithMoreRetries = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({ attempts: 3 }),
  withSSEOptions({ reconnect: { attempts: 10, delayMs: 1000 } }),
)
```

## 下一步

- [客户端 →](/core/client) — 客户端创建和 `execute` 用法
- [命令 →](/core/commands) — 命令定义和输入可选规则
- [SSE →](/core/sse) — SSE 执行、重连和事件处理
- [WebSocket →](/core/web-socket) — WebSocket 连接、心跳和状态管理
- [拦截器 →](/core/interceptors) — 拦截器类型和洋葱链机制
