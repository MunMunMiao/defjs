---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

使用 `defineRequest` 定义 HTTP 端点，然后通过 `Client.execute()` 执行。核心包自动处理结构验证、状态码分发、信号合并和响应体解析。

## 定义端点

`defineRequest` 接受一个定义对象，包含 `method`、`path`、`input`（可选）、`output`（可选）和 `build`（可选）。

提供 `input` 时，必须同时提供 `build`，以描述输入字段如何映射到请求各部分（路径参数、查询参数、请求头、请求体）。

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

如果不需要输入，同时省略 `input` 和 `build`：

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## 状态码到结构的输出映射

`output` 将 HTTP 状态码映射到结构。运行时按响应状态码选择匹配的结构。

同时支持对象和数组形式：

```typescript
import { defineRequest, object, string } from '@defjs/core'

// 对象形式：键是状态码，值是结构
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// 数组形式：支持将多个状态码映射到同一个结构
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

如果服务器返回了 `output` 中未声明的状态码，请求将以 `DefinitionError` 失败，其 `code` 为 `UNDECLARED_STATUS`。

## 成功/错误数据类型推断

`output` 驱动 TypeScript 类型推断。`Client.execute()` 返回 `HttpAwaitResult`，自动区分 2xx 成功数据和非 2xx 错误数据。

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result 类型为 { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data 类型为 { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### 类型辅助工具

- `RequestSuccessData<TOutput>`：从 `output` 提取所有 2xx 结构输出类型。如果没有 2xx 映射，推断为 `unknown`。
- `RequestErrorData<TOutput>`：从 `output` 提取所有非 2xx 结构输出类型。如果没有非 2xx 映射，推断为 `unknown`。

## 执行请求

调用 `Client.execute()` 并传入命令。第二个参数是可选的 `HttpExecuteOptions`：

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* 拦截器可读取的自定义上下文 */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // 别名，等价于 abort
})
```

返回的 `HttpAwaitResult` 是一个三元组：

| 位置 | 类型                                     | 含义                                              |
| ---- | ---------------------------------------- | ------------------------------------------------- |
| 0    | `RequestError<TErrorData> \| null`       | 错误对象；成功时为 `null`                         |
| 1    | `TSuccess \| undefined`                  | 成功数据；失败时为 `undefined`                    |
| 2    | `SettledResponse<TSuccess> \| undefined` | 原始响应包装，包含 `status`、`headers`、`body` 等 |

## 取消和超时

`abort`、`timeout` 和 `signal` 控制请求生命周期。**`abort` 和 `timeout` 不能同时使用** —— 这样做会在请求发送前产生验证错误。

### 使用 AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// 稍后取消
controller.abort()

// 取消后，error.kind 为 'transport'，code 为 'ABORTED'
```

### 使用超时

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5 秒超时
})

// 超时后，error.kind 为 'transport'，code 为 'TIMEOUT'
```

### 合并外部信号

如果同时传入 `abort` 和 `signal`，框架会将它们合并为单个 `AbortSignal`。`timeout` 也作为 `AbortSignal.timeout()` 参与。任何信号触发都会中止请求。

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // 与 abort 合并
})
```

### 错误区分

取消和超时都是 `TransportError`，通过 `error.code` 区分：

| 场景     | `error.code`    | 说明                                            |
| -------- | --------------- | ----------------------------------------------- |
| 手动取消 | `ABORTED`       | `controller.abort()` 或外部信号触发             |
| 超时     | `TIMEOUT`       | `timeout` 到期，或 `AbortSignal.timeout()` 触发 |
| 网络失败 | `NETWORK_ERROR` | fetch 的其他异常                                |

## 下载/上传进度

通过 `onDownloadProgress` 和 `onUploadProgress` 追踪进度。

### 下载进度

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` 包含三个字段：

- `lengthComputable`：服务器是否返回了 `Content-Length`
- `loaded`：已接收字节数
- `total`：总字节数（仅当 `lengthComputable` 为 `true` 时有效）

### 上传进度

上传进度仅在请求体为 `ReadableStream<Uint8Array>` 时有效。框架包装流并在每块发送后回调。

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## 响应类型

默认情况下，如果声明了 `output`，框架自动将响应解析为 `json`。你可以通过 `responseType` 覆盖，或在 `output` 为 `undefined` 时指定。

```typescript
import { defineRequest } from '@defjs/core'

// 显式响应类型
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// 不关心 output，只关注原始响应
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

支持的 `responseType` 值：

| 值            | 说明                                           |
| ------------- | ---------------------------------------------- |
| `json`        | 读取文本后 `JSON.parse()`；空响应体返回 `null` |
| `text`        | 直接返回文本字符串                             |
| `blob`        | 返回 `Blob`                                    |
| `arraybuffer` | 返回 `ArrayBuffer`                             |

当 `responseType` 为 `json` 且 `output` 为返回状态码定义了结构时，框架会针对该结构验证解析后的 JSON。如果验证失败，返回 `code: 'RESPONSE_VALIDATION_FAILED'` 的 `DefinitionError`。

## 下一步

- [客户端 →](/core/client) — 创建 `Client`、拦截器、XSRF、全局选项
- [SSE →](/core/sse) — 服务器推送事件和流式响应
- [WebSocket →](/core/web-socket) — 双向实时通信
