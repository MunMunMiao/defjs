---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

使用 `defineRequest` 定义 HTTP 端点，然后通过 `Client.execute()` 执行。核心包自动处理结构验证、状态码分发、信号合并和响应体解析。

## 定义端点

`defineRequest` 接受一个定义对象，包含 `method`、`path`、`input`（可选）、`output`（可选）和 `build`（可选）。

`input` 用来描述命令输入形状，常见映射方式有两种：

1. 当字段可以直接映射到 HTTP 传输部分（如 `path`、`query`、`headers`、`body`）时，使用 `struct.request(...)`，Defjs 会自动构建这些请求部分。
2. 当公开输入形状与实际传输形状不同，或者你需要自定义映射逻辑时，使用 `build(ctx, input)`。

```typescript
import { defineRequest, struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    query: struct.object({ includePosts: struct.boolean() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

如果不需要输入，同时省略 `input` 和 `build`：

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: [
    {
      status: 200,
      body: struct.object({
        items: struct.array(User),
      }),
    },
  ] as const,
})
```

当公开输入形状与实际传输形状不同时，添加 `build(ctx, input)` 并显式映射字段：

```typescript
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.object({
    id: struct.number(),
    preview: struct.boolean(),
    body: struct.object({ name: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams({ id: input.id })
    ctx.setQueryParams({ preview: input.preview })
    ctx.setJson(input.body)
  },
  output: [
    { status: 200, body: User },
    { status: 400, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

## 状态码到结构的输出映射

`output` 将 HTTP 状态码映射到结构。运行时按响应状态码选择匹配的结构。

本指南主要使用数组形式，因为它能更明确地表达状态码 / 响应体配对，也便于将多个状态码归到同一组。对象形式依然受支持，适合较紧凑的参考示例。

```typescript
import { defineRequest, struct } from '@defjs/core'

// 对象形式：键是状态码，值是结构
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.object({ name: struct.string() }),
  }),
  output: {
    201: struct.object({ id: struct.number(), name: struct.string() }),
    400: struct.object({ message: struct.string() }),
    409: struct.object({ message: struct.string() }),
  },
})

// 数组形式：支持将多个状态码映射到同一个结构
const updateUserOutput = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: [400, 422], body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

如果服务器返回了 `output` 中未声明的状态码，请求将以 `DefinitionError` 失败，其 `code` 为 `UNDECLARED_STATUS`。

## 成功/错误数据类型推断

`output` 驱动 TypeScript 类型推断。`Client.execute()` 返回 `HttpAwaitResult`，自动区分 2xx 成功数据和非 2xx 错误数据。

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    400: struct.object({ field: struct.string(), reason: struct.string() }),
    500: struct.object({ traceId: struct.string() }),
  },
})

const [error, result, response] = await client.execute(endpoint())

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
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext()

const [error, result, response] = await client.execute(command(), {
  context,
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  signal: abortSignal, // 直接传入 AbortSignal 的别名
})
```

返回的 `HttpAwaitResult` 是一个三元组：

| 位置 | 类型                                     | 含义                                                                                                                             |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `RequestError<TErrorData> \| null`       | 错误对象；成功时为 `null`                                                                                                        |
| 1    | `TSuccess \| undefined`                  | 成功数据；失败时为 `undefined`，如果省略 `output` 也会是 `undefined`                                                             |
| 2    | `SettledResponse<TSuccess> \| undefined` | 原始响应包装，包含 `status`、`headers`、`body` 等；当省略 `output` 时，已完成请求仍会返回该包装，但其中的 `body` 会被设为 `null` |

## 取消和超时

`abort`、`timeout` 和 `signal` 控制请求生命周期。**`abort` 和 `timeout` 不能同时使用** —— 这样做会在请求发送前产生验证错误。

### 使用 AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command(), {
  abort: controller.signal,
})

// 稍后取消
controller.abort()

// 取消后，error.kind 为 'transport'，code 为 'ABORTED'
```

### 使用超时

```typescript
const [error] = await client.execute(command(), {
  timeout: 5000, // 5 秒超时
})

// 超时后，error.kind 为 'transport'，code 为 'TIMEOUT'
```

### 合并外部信号

如果同时传入 `abort` 和 `signal`，框架会将它们合并为单个 `AbortSignal`。任何一个信号触发都会中止请求。`timeout` 仍然是单独的另一种控制方式，不能与 `abort` 组合使用。

```typescript
const controller = new AbortController()

const [error] = await client.execute(command(), {
  abort: controller.signal,
  signal: someOtherSignal, // 与 abort 合并
})
```

如果你需要“超时限制 + 另一个外部信号”，可以把 `timeout` 和 `signal` 搭配使用：

```typescript
const [error] = await client.execute(command(), {
  timeout: 5000,
  signal: someOtherSignal,
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
const [error, result] = await client.execute(command(), {
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

const [error, result] = await client.execute(command(), {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## 响应类型

默认情况下，如果声明了 `output`，框架会自动按 `json` 解析响应。你也可以通过 `responseType` 覆盖这一点。当 `output` 为 `undefined` 时，`responseType` 只会影响内部响应解析路径；调用方拿到的结果数据仍然是 `undefined`，响应包装里的 `body` 也会被设为 `null`。

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

// 已声明 output，并显式指定响应类型
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
  output: [{ status: 200, body: struct.blob() }] as const,
})

// 未声明 output：适合只检查状态码 / 响应头
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})

const [healthError, healthResult, healthResponse] = await client.execute(healthCheck())
// healthResult 是 undefined
// healthResponse?.body 在这条路径上会被设为 null
// 如果你需要读取响应体，请声明与 responseType 匹配的 output。
```

支持的 `responseType` 值：

| 值            | 说明                                           |
| ------------- | ---------------------------------------------- |
| `json`        | 读取文本后 `JSON.parse()`；空响应体返回 `null` |
| `text`        | 直接返回文本字符串                             |
| `blob`        | 返回 `Blob`                                    |
| `arraybuffer` | 返回 `ArrayBuffer`                             |

当 `responseType` 为 `json` 且 `output` 为返回状态码定义了结构时，框架会针对该结构验证解析后的 JSON。如果验证失败，返回 `code: 'RESPONSE_VALIDATION_FAILED'` 的 `DefinitionError`。

如果省略 `output`，请求仍然会以状态码和响应头完成，但三元组中的第二项仍然是 `undefined`，响应包装里的 `body` 也会被设为 `null`。这种写法适合健康检查、类似 HEAD 的用法，或只断言状态码 / 响应头的场景。如果你需要响应体数据，请声明与所选 `responseType` 匹配的 `output`。

## 下一步

- [客户端 →](/core/client) — 创建 `Client`、拦截器、XSRF、全局选项
- [SSE →](/core/sse) — 服务器推送事件和流式响应
- [WebSocket →](/core/web-socket) — 双向实时通信
