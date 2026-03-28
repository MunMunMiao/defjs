# `@defjs/core` 使用手册

这份文档只保留当前最常用的 API 和使用方式。

## 快速开始

### 创建 client

```ts
import { createClient, createGlobalClient } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com/v1',
})

createGlobalClient({
  endpoint: 'https://api.example.com/v1',
})
```

`endpoint` 是基础地址。内部会先用 `new URL(endpoint)` 解析，然后再拼接 endpoint 定义里的 `path`。

例如：

```ts
endpoint = 'https://api.example.com/v1'
path = '/user/info'
```

最终请求地址是：

```ts
https://api.example.com/v1/user/info
```

## Client 规则

`client` 分两种：

1. 全局 client
2. 独立 client

推荐方式：

1. 前端大多数场景直接创建一个全局 client
2. 如果要请求多个外部 API，再在实际调用时传独立 client

请求时查找 client 的顺序固定为：

1. 第二段配置里的 `client`
2. 全局 client
3. 两者都没有时直接报错

也就是说，当前不会在定义 endpoint 时绑定 client。

## Schema

endpoint 定义层当前接受两类 schema：

1. `@defjs/core` 自带 `schema`
2. Standard Schema 兼容对象

有两条硬规则：

1. 请求侧不再提供 `schema.json / schema.formData / schema.urlSearchParams`
2. `input` 或 `output` 省略时，表示这一层完全忽略解析

这意味着：

1. `input` 省略时，传入值原样交给 `build(request, input)`
2. `output` 省略时，即使服务端 body 有值，也不会解析，HTTP 的 `result` 会是 `undefined`

## HTTP

### 定义 endpoint

```ts
import { defineRequest, schema } from '@defjs/core'

const getUserInfo = defineRequest({
  method: 'GET',
  path: '/user/:id',
  input: schema.object({
    userId: schema.number(),
  }),
  build: (request, input) => {
    request.pathParams({
      id: input.userId,
    })
  },
  output: {
    200: schema.object({
      id: schema.number(),
      name: schema.string(),
    }),
    404: schema.object({
      code: schema.string(),
      message: schema.string(),
    }),
  },
})
```

请求侧只有 `build(request, input)` 这一条主路径。常用 helper：

1. `request.pathParams(...)`
2. `request.queryParams(...)`
3. `request.headers(...)`
4. `request.body(...)`
5. `request.json(...)`
6. `request.text(...)`
7. `request.html(...)`
8. `request.xml(...)`
9. `request.formData(...)`
10. `request.formUrlEncoded(...)`

其中：

1. `request.body(...)` 是通用入口
2. `request.formData(...)` 只接受可安全编码为 multipart 的标量、`Blob` / `File` 及其数组
3. 没有 body 时不会设置 `Content-Type`
4. 只有自动检测不到 body 类型时，才兜底成 `application/octet-stream`

### 调用

无配置：

```ts
const [error, data, response] = await getUserInfo.use({
  userId: 1,
})
```

有配置：

```ts
const [error, data, response] = await getUserInfo.use({
  userId: 1,
})({
  client,
  handler,
  timeout: 10_000,
  abort: ac.signal,
  onUploadProgress(event) {},
  onDownloadProgress(event) {},
  context,
})
```

第二段 HTTP 配置：

1. `client?: Client`
2. `handler?: HttpHandler`
3. `timeout?: number`
4. `abort?: AbortSignal`
5. `onUploadProgress?: HttpProgressFn`
6. `onDownloadProgress?: HttpProgressFn`
7. `context?: HttpContext`

### 返回值

HTTP 固定返回：

```ts
[error, result, response]
```

语义：

1. `2xx`：`[null, result, response]`
2. 非 `2xx`：`[error, undefined, response]`

补充说明：

1. `output` 省略时，`result` 固定是 `undefined`
2. `response` 始终保留 `status / headers / url / ok`
3. 已声明的非 `2xx` 响应体会保留在 `error.data`

### 非 JSON 响应

如果接口返回的不是 JSON，需要在 definition 顶层显式声明：

```ts
const downloadAvatar = defineRequest({
  method: 'GET',
  path: '/avatar',
  responseType: 'blob',
  output: {
    200: schema.blob(),
  },
})
```

支持的值：

1. `json`
2. `text`
3. `blob`
4. `arraybuffer`

### `output` 的两种写法

```ts
output: {
  200: userSchema,
  201: userSchema,
  404: errorSchema,
}
```

```ts
output: [
  {
    status: [200, 201],
    body: userSchema,
  },
  {
    status: 404,
    body: errorSchema,
  },
]
```

## SSE

### 定义 endpoint

```ts
import { defineEventStream, schema } from '@defjs/core'

const watchUserInfo = defineEventStream({
  path: '/user/:id/events',
  input: schema.object({
    userId: schema.number(),
  }),
  build: (request, input) => {
    request.pathParams({
      id: input.userId,
    })
  },
  events: {
    message: schema.object({
      id: schema.number(),
      name: schema.string(),
    }),
    default: schema.unknown(),
  },
})
```

### 调用

无配置：

```ts
const [error, stream, open] = await watchUserInfo.use({
  userId: 1,
})
```

有配置：

```ts
const [error, stream, open] = await watchUserInfo.use({
  userId: 1,
})({
  client,
  fetch,
  timeout: 10_000,
  abort: ac.signal,
  context,
})
```

第二段 SSE 配置：

1. `client?: Client`
2. `fetch?: typeof fetch`
3. `timeout?: number`
4. `abort?: AbortSignal`
5. `context?: HttpContext`

### 返回值

SSE 固定返回：

```ts
[error, stream, open]
```

其中：

1. `error` 只表示启动阶段错误
2. `open` 是启动元信息，包含 `response` 和 `url`
3. `stream.closed` 表示流结束信息

### 事件处理规则

当前是宽松语义：

1. 未声明事件直接跳过
2. 已声明但 payload 校验失败的事件也直接跳过
3. 不提供 strict 模式

## WebSocket

### 定义 endpoint

```ts
import { defineWebSocket, schema } from '@defjs/core'

const chatSocket = defineWebSocket({
  path: '/ws/chat',
  input: schema.object({
    roomId: schema.string(),
  }),
  build: (request, input) => {
    request.queryParams({
      roomId: input.roomId,
    })
  },
  incoming: {
    message: schema.object({
      text: schema.string(),
    }),
  },
  outgoing: {
    message: schema.object({
      text: schema.string(),
    }),
  },
  protocols: ['json'],
})
```

### 调用

无配置：

```ts
const [error, socket, connection] = await chatSocket.use({
  roomId: 'room-1',
})
```

有配置：

```ts
const [error, socket, connection] = await chatSocket.use({
  roomId: 'room-1',
})({
  client,
  protocols: ['json'],
  beforeConnect: async () => {},
  reconnect: {
    attempts: 1,
  },
  heartbeat: {
    intervalMs: 30_000,
    message: () => ({
      type: 'ping',
    }),
  },
  queue: {
    maxSize: 100,
  },
  timeout: 10_000,
  abort: ac.signal,
})
```

第二段 WebSocket 配置：

1. `client?: Client`
2. `protocols?: readonly string[]`
3. `beforeConnect?: () => void | Promise<void>`
4. `reconnect?: WebSocketReconnectOptions`
5. `heartbeat?: WebSocketHeartbeatOptions`
6. `queue?: WebSocketQueueOptions`
7. `timeout?: number`
8. `abort?: AbortSignal`

### 返回值

WebSocket 固定返回：

```ts
[error, socket, connection]
```

其中：

1. `connection` 包含 `url / protocol / extensions`
2. `socket.receive` 是 `AsyncIterable`
3. `socket.send(...)` 会按 outgoing schema 校验
4. `socket.closed` 提供关闭信息

### WebSocket 规则

1. 当前只对齐标准 WebSocket Web API
2. 不支持自定义握手 headers
3. `protocols` 是覆盖型字段
4. `beforeConnect` 是无参通知 hook，不消费返回值
5. `heartbeat.message` 是可选函数；不提供时不会主动发 heartbeat 消息
6. 未声明消息直接跳过
7. 已声明但 payload 校验失败的消息也直接跳过

## `context + interceptor`

事务、trace、request-scoped metadata 当前统一走：

1. `context`
2. `interceptor`

建议边界：

1. 事务状态、trace、request-scoped metadata 放进 `context`
2. 需要基于这些上下文改写 headers/query/body 的逻辑放进 interceptor
3. 不在 `client` 或 endpoint 定义层新增事务字段

## 当前不提供

当前明确不纳入主设计的能力：

1. `schema.empty()`
2. `executeRaw(...)`
3. SSE / WebSocket strict 模式
4. WebSocket 自定义握手 headers
5. WebSocket 自定义 transport / factory
6. OpenAPI 生成与 schema 导出
