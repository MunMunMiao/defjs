---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# 客户端

`@defjs/core` 采用**显式客户端**设计。每个请求都通过你显式创建的 `Client` 实例执行。这使得测试、多环境配置和依赖追踪变得简单直接。

## 创建客户端

使用 `createClient` 并传入一个或多个配置函数。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

配置函数可以组合。后续函数对相同键会覆盖前面的函数。

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### 配置选项

| 函数                                | 说明                                         |
| ----------------------------------- | -------------------------------------------- |
| `withEndpoint(url)`                 | 基础 API 地址                                |
| `withHTTPHandle(fetch)`             | 自定义 HTTP `fetch` 实现                     |
| `withSSEHandle(fetch)`              | 自定义 SSE `fetch` 实现                      |
| `withWebSocketHandle(WebSocket)`    | 自定义 `WebSocket` 构造函数（例如用于 Node） |
| `withInterceptors(...interceptors)` | 注册传输层拦截器。按 `kind` 自动分发         |
| `withQueryParamsSerializer(fn)`     | 自定义查询参数序列化                         |
| `withCredentials(boolean)`          | 是否包含跨域凭证                             |
| `withXSRF(options)`                 | XSRF 令牌读取和注入行为                      |
| `withSSEOptions(options)`           | SSE 重连、队列、无效事件处理等               |
| `withWebSocketOptions(options)`     | WebSocket 心跳、重连、队列、子协议等         |

SSE 和 WebSocket 的具体配置，请参阅 [SSE](/core/sse) 和 [WebSocket](/core/web-socket)。

## 执行命令

`Client.execute` 是一个重载方法，根据 `Command` 类型分发到正确的传输层。

### HTTP 请求

传入由 `defineRequest` 构建的命令。返回三元组：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

返回类型：

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE 事件流

传入由 `defineEventStream` 构建的命令。返回流句柄和连接信息。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

返回类型：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket 连接

传入由 `defineWebSocket` 构建的命令。返回会话对象。

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

返回类型：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## 辅助函数

### `isClient`

检查一个值是否为有效的 `Client` 实例。

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

提取内部配置对象，用于调试或构建更高层抽象。

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

如果传入的值不是 `Client` 实例，`getClientConfig` 会抛出 `TypeError`。

## 显式客户端设计

Defjs 中的每个客户端都是显式创建的。你可以使用 `createClient` 创建 `Client`，并将它传递到需要的地方。

显式创建的优点：

- **测试友好**：直接将不同的 `Client` 实例传入测试，无需重置或模拟任何状态。
- **多环境共存**：多个客户端可以在同一进程中并行运行（例如内部 API + 公共 API）。
- **依赖透明**：调用方必须显式持有 `Client`，使得依赖关系对静态分析和代码审查可见。

如果你在应用中需要共享客户端，请从模块导出：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

然后在业务代码中导入使用：

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## 下一步

- [HTTP 请求 →](/core/http) — `defineRequest` 和输出模式
- [SSE →](/core/sse) — SSE 定义、重连和事件队列
- [WebSocket →](/core/web-socket) — WebSocket 定义、心跳和重连策略
- [拦截器 →](/core/interceptors) — 拦截器类型和洋葱链机制
