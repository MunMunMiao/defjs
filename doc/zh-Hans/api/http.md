---
title: HTTP
description: defineRequest、execute options，以及 HTTP 请求/响应类型。
---

# HTTP

声明一次类型化请求，用 input 打出 command，再 execute。

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`、`path`，可选 `input` struct，按 status 分的 `output`，可选 `operation` 和 `build`。
- **返回** 一个 builder。塞 input 调用，得到 `HttpCommand`。

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})
```

`output` 也可以是 `{ status, body }` 分组列表（好几个状态码共用一个 body struct）。

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

`client.execute` 走的底层入口。业务代码调 `client.execute(command, options)`。

- **返回** `[null, body, response]` 或 `[error, undefined, response?]`。

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

默认 HTTP 传输。没被 `withHTTPHandle` 换掉就用它。

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

不走网络造一个 `HttpResponse`（interceptor、测试）。默认 status 是 `0`。2xx 时 `ok` 为 true。

## 执行 options

## HttpExecuteOptions {#HttpExecuteOptions}

```ts
type HttpExecuteOptions = {
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

取消是 `abort` **或** `timeout`，不能两个一起。`signal` 可与其中任一组合，**不是** `abort` 的别名。合法形状：`{ timeout }`、`{ abort }`、`{ signal, timeout }`、`{ signal, abort }`。`{ abort, timeout }` 非法。`timeout` 必须是 `1..2_147_483_647` 的正 safe integer。

## 类型

### RequestDefinition {#RequestDefinition}

`method`、`path`，可选 `input`、`output`、`responseType`（`'json' | 'text' | 'blob' | 'arraybuffer'`）、`operation`，可选 `build`（自己拼请求；需要 `input`）。

### RequestOutputShape {#RequestOutputShape}

```ts
type RequestOutputShape = { [status: number]: AnyStruct } | readonly { status: number | readonly number[]; body: AnyStruct }[]
```

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]
```

### HttpRequest {#HttpRequest}

规范化后的出站请求：`method`、`endpoint`、`headers`、`body`、`abort`、`operation`、进度 hooks、`baseEndpoint`、query 元数据。

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}
```

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`、`total`、`lengthComputable`。回调可以是 async。

见 [HTTP 指南](../core/http.md) 和 [Commands](../core/commands.md)。

## ResponseGroupItem {#ResponseGroupItem}

`RequestOutputShape` 列表形态里的一行 `{ status, body }`。`status` 可以是一个码，也可以好几个码共用一个 body struct。

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest` 的返回值。拿 input 调一下就得到 `HttpCommand`。

## HttpCommand {#HttpCommand}

请求 builder 吐出来的不透明 command。丢给 `client.execute`。

## UseRequestConfig {#UseRequestConfig}

进度、取消。`HttpExecuteOptions` 再加一个 `signal`。

## RequestSuccessData {#RequestSuccessData}

从声明过的 2xx `output` 推出来的成功 body。

## RequestErrorData {#RequestErrorData}

从声明过的非 2xx `output` 推出来的错误 body。

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

给 `makeResponse` 的字段：`status`、`statusText`、`url`、`headers`、`body`、`error`。
