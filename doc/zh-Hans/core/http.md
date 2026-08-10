---
title: HTTP
description: 构建 HTTP URL 和 body，分派 response Struct，取消请求，配置 credentials 与 XSRF，并理解 Fetch boundary。
---

# HTTP

`defineRequest(...)` 创建 HTTP command builder。[Commands](/zh-Hans/core/commands) 负责端点定义和 input projection；本页只讲 HTTP wire 和生命周期行为。

## URL 构建

`withEndpoint(...)` 必须提供 absolute base URL。它的 path 会作为目录保留：

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Base path 末尾没有 slash 时会自动补上。Base endpoint 上的 query 和 hash 都会被丢弃。

Endpoint `path` 是相对 contract path。开头的 slash 可以保留，解析前会被移除，因此不会替换 base directory。Runtime 会拒绝：

- absolute URL 和 protocol-relative URL；
- 包含 `?` 的 path；
- 包含 `#` 的 path。

Path placeholder 使用 `:name`：

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

请直接传入原始 placeholder 值。Defjs 会先把 scalar 序列化为字符串，拒绝空值以及完整值 `.`、`..`，再在替换前精确调用一次 `encodeURIComponent`。`/`、`?`、`#`、`%`、空格和 Unicode 都会保留在单个 path segment 内。不要预编码；`%` 会按原始输入处理并编码为 `%25`。

## Request 编码

字段直接映射到 wire 时，使用 `struct.request(...)`：

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

Body Struct 决定编码和默认 content type：

| Body Struct                | Wire body             | 默认 `Content-Type`                               |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | string                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | 由平台设置，包括 boundary                         |
| `struct.blob()`            | `Blob`                | Blob type 或 `application/octet-stream`           |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

自定义 `build` 可以调用对应的 HTTP builder method。Setter method 替换该 request part；`addHeaders`、`addFormData` 和 `addFormUrlEncoded` 追加到当前 part。所有值都必须来自 schema-bound projection。

### Query Value

默认 query encoder 接受扁平 scalar，以及 scalar array。嵌套 object 会在 request building 阶段失败。

`withQueryParamsSerializer((params, rawParams) => string)` 可以改变已接受扁平值的输出方式。它收到一个 `URLSearchParams` view 和编码后的扁平 record。它不能让嵌套 query object 变得有效，因为这些 object 在 serializer 执行前就会被拒绝。

Alias 会变成 outbound query、path 和 header key。调用方仍使用 Struct 中的逻辑字段名。

## Status 与 Output 解码

`output` 把 status code 映射到 response Struct：

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

Runtime 按精确 status 选择 Struct。声明了 `output` 时，任何未匹配 status 都会产生 `UNDECLARED_STATUS`。已声明 2xx body 组成 success-data union；已声明非 2xx body 组成 `error.data`。

`response.ok` 只表示 `status >= 200 && status < 300`，不代表 output 解码、应用校验或 authorization 成功。

声明 `output` 且省略 `responseType` 时，response 默认按 `json` 解析。显式 mode 包括 `json`、`text`、`blob` 和 `arraybuffer`。随后由选中的 Struct 做结构化解码。省略 `output` 时不允许指定 `responseType`，结果 data 是 `undefined`，返回的 response wrapper 中 `body` 为 `null`。Runtime 不会读取或解码 response body，只会尽力取消它。

Command 结果按固定优先级分类：status 0 transport failure → 无 `output` → 精确 status 匹配或 `UNDECLARED_STATUS` → `response.error` → Struct 解码。因此，body representation error 只可能在声明了 `output` 时出现；如果 Fetch 记录了这类错误，未声明 status 分支仍然优先。

### Representation Error

对于精确匹配的已声明 output，JSON 或其他 body codec 失败时，Fetch 会把原始异常保存在 `HttpResponse.error`。Command execution 会在应用 output Struct 前停止，并返回 `[RESPONSE_VALIDATION_FAILED, undefined, response]`；原始异常保留为 `cause`，且不会生成 typed `error.data`。

普通非 2xx response 不会填充 `response.error`，其状态由 `status` 和 `ok` 表示。非 2xx status 与 body 已声明且 body 合法时，Struct 会正常解码，最终 `HTTP_STATUS` error 会把 typed body 保留在 `error.data`。

## HTTP 结果

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

成功时，`response` 是 Defjs `HttpResponse` wrapper，它的 body 与 `data` 一致。失败时是否有 response，取决于 execution 进行到哪一步。完整分类见 [Errors](/zh-Hans/core/errors)。

## 取消与 Timeout

HTTP execution 接受 `abort`、`signal` 和 `timeout`：

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` 会与 client internal signal、正数 timeout 合并。独立的 `abort` 字段是当前 API 保留的另一种 cancellation signal。不能同时提供 `abort` 和 `timeout`；这样做会返回 `REQUEST_VALIDATION_FAILED`。`signal` 可以与其中任意一个组合。

HTTP、SSE 和 WebSocket execution 的 `timeout` 必须是 `1..2_147_483_647` 范围内的正安全整数；`0`、负数、小数、`NaN`、`Infinity` 或超上限值会在创建 request、stream 或 socket 资源前返回 `REQUEST_VALIDATION_FAILED`。

已识别的取消产生 `ABORTED`。`AbortSignal.timeout(...)` reason 或 execution timeout 产生 `TIMEOUT`。其他 Fetch failure 产生 `NETWORK_ERROR`。

## Credentials 与 XSRF

`withCredentials(true)` 为 HTTP 和 SSE 设置 Fetch `credentials: 'include'`。`false` 会让该 Fetch option 保持未设置，而不是强制使用 `omit`。这个设置不会添加 `Authorization` header，也不会配置 WebSocket authentication。

`withXSRF(...)` 只作用于 HTTP request。默认值是：

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

RFC 安全方法 `GET`、`HEAD`、`OPTIONS` 和 `TRACE` 会跳过注入。其他所有方法，包括 `PROPPATCH` 这样的自定义非安全方法，都会在注入前使用相同的已存在 header、same-origin 和 token guard。已存在的配置 header 会被保留。浏览器 cookie lookup 仅限 same-origin request。浏览器之外请提供同步 `tokenProvider`；它的优先级高于 cookie lookup。

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

服务端 token provider 必须保持 request-scoped。`withCredentials(true)` 不会让 JavaScript 能读取 cross-origin browser cookie，也不会触发 cross-origin XSRF header 注入。

## Progress Observer

`onDownloadProgress` 在读取 Fetch response body 时报告 byte。只有存在正数 `Content-Length` 时，`lengthComputable` 才是 true。

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` 只观察 `ReadableStream<Uint8Array>` request body。当前高层 command builder 提供 Blob 和 ArrayBuffer projection setter，但没有 raw stream setter。因此，没有标准 `defineRequest` 示例能提供该 option 所需的 stream。不要把手工构造的 stream 写成可用的高层 command body。

Progress callback 在 transport read/write path 中运行。请确保它不抛错，而且执行开销足够小。

## 低层 Fetch Boundary

`fetchHandler(httpRequest, fetchImpl?)` 已导出。它把 Defjs `HttpRequest` 转成原生 `Request`，调用 Fetch，解析选定的 response representation，再返回 Defjs `HttpResponse` wrapper。Fetch failure 会变成 status-0 wrapper。

直接调用 `fetchHandler` 会绕过：

- command input 解码和 request projection；
- HTTP output status dispatch 和 Struct 解码；
- client interceptor orchestration；
- 到高层 `RequestError` tuple 的转换。

它是已导出的低层 boundary，不是推荐的 command 工作流。本文档尚未确定它的长期稳定性承诺。

## 下一步

- [Interceptors](/zh-Hans/core/interceptors)：request cloning、short-circuit 和 retry。
- [Errors](/zh-Hans/core/errors)：HTTP status、transport 和 definition failure。
- [Struct](/zh-Hans/core/struct)：严格结构化解码。
