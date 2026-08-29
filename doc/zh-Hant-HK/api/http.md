---
title: HTTP
description: defineRequest、execute options，同 HTTP request/response types。
---

# HTTP

Declare 一個 typed request，用 input build command，之後 execute。

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`、`path`，optional `input` struct，`output` 按 status key，optional `operation` 同 `build`。
- **Returns** 一個 builder。Call 佢再傳 input，就會得到 `HttpCommand`。

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

`output` 亦都可以係 `{ status, body }` groups 嘅 list（幾個 codes 共用一個 body struct）。

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Low-level entry，`client.execute` 用呢個。Application code 應該 call `client.execute(command, options)`。

- **Returns** `[null, body, response]` 或者 `[error, undefined, response?]`。

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Default HTTP transport。除非 `withHTTPHandle` 換走佢，否則就用呢個。

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

唔打 network 都 build 到 `HttpResponse`（interceptors、tests）。Default status 係 `0`。2xx 嘅時候 `ok` 係 true。

## Execute options

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

Cancellation 係 `abort` **或者** `timeout`，唔可以兩個一齊。`signal` 可以同其中一個一齊用，**唔係** `abort` 嘅 alias。合法形狀：`{ timeout }`、`{ abort }`、`{ signal, timeout }`、`{ signal, abort }`。`{ abort, timeout }` 唔得。`timeout` 一定要係 `1..2_147_483_647` 入面嘅 positive safe integer。

## Types

### RequestDefinition {#RequestDefinition}

`method`、`path`，optional `input`、`output`、`responseType`（`'json' | 'text' | 'blob' | 'arraybuffer'`）、`operation`，optional `build`（custom request assembly；要有 `input`）。

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

Normalized outgoing request：`method`、`endpoint`、`headers`、`body`、`abort`、`operation`、progress hooks、`baseEndpoint`、query metadata。

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

`loaded`、`total`、`lengthComputable`。Callbacks 可以係 async。

睇 [HTTP guide](../core/http.md) 同 [Commands](../core/commands.md)。

## ResponseGroupItem {#ResponseGroupItem}

`RequestOutputShape` list 形態入面一行 `{ status, body }`。`status` 可以係一個 code，或者幾個 code 共用一個 body struct。

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest` 嘅回傳。用 input call 一次就攞到 `HttpCommand`。

## HttpCommand {#HttpCommand}

Request builder 吐出嚟嘅 opaque command。交畀 `client.execute`。

## UseRequestConfig {#UseRequestConfig}

progress、cancellation。`HttpExecuteOptions` 再加 `signal`。

## RequestSuccessData {#RequestSuccessData}

由 declared 2xx `output` infer 出嚟嘅成功 body。

## RequestErrorData {#RequestErrorData}

由 declared 非 2xx `output` infer 出嚟嘅錯誤 body。

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

`makeResponse` 用嘅 fields：`status`、`statusText`、`url`、`headers`、`body`、`error`。
