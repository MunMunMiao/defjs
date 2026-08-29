---
title: HTTP
description: defineRequest、execute options，以及 HTTP request／response 型別。
---

# HTTP

宣告型別化的 request，從 input 組出 command，再執行。

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`、`path`、選填 `input` struct、依 status 對應的 `output`、選填 `operation` 與 `build`。
- **回傳** builder。帶 input 呼叫就得到 `HttpCommand`。

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

`output` 也可以是 `{ status, body }` 群組清單（多個 status 共用一個 body struct）。

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

`client.execute` 走的低階入口。寫功能時請呼叫 `client.execute(command, options)`。

- **回傳** `[null, body, response]` 或 `[error, undefined, response?]`。

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

預設 HTTP 傳輸。除非被 `withHTTPHandle` 換掉。

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

不打網路也能組出 `HttpResponse`（interceptors、測試）。預設 status 是 `0`。2xx 時 `ok` 為 true。

## 執行 options

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

取消用 `abort` **或** `timeout`，不能兩個一起。`signal` 可與其中任一組合，**不是** `abort` 的別名。合法形狀：`{ timeout }`、`{ abort }`、`{ signal, timeout }`、`{ signal, abort }`。`{ abort, timeout }` 非法。`timeout` 必須是 `1..2_147_483_647` 的正 safe integer。

## 型別

### RequestDefinition {#RequestDefinition}

`method`、`path`、選填 `input`、`output`、`responseType`（`'json' | 'text' | 'blob' | 'arraybuffer'`）、`operation`、選填 `build`（自訂組裝 request；需要 `input`）。

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

正規化後的外送 request：`method`、`endpoint`、`headers`、`body`、`abort`、`operation`、progress hooks、`baseEndpoint`、query metadata。

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

`loaded`、`total`、`lengthComputable`。Callbacks 可以是 async。

見 [HTTP 指南](../core/http.md) 與 [Commands](../core/commands.md)。

## ResponseGroupItem {#ResponseGroupItem}

`RequestOutputShape` 列表形態裡的一列 `{ status, body }`。`status` 可以是一個碼，也可以多個碼共用一個 body struct。

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest` 的回傳值。拿 input 呼叫就得到 `HttpCommand`。

## HttpCommand {#HttpCommand}

請求 builder 吐出的不透明 command。丟給 `client.execute`。

## UseRequestConfig {#UseRequestConfig}

進度、取消。`HttpExecuteOptions` 再加一個 `signal`。

## RequestSuccessData {#RequestSuccessData}

從宣告過的 2xx `output` 推出的成功 body。

## RequestErrorData {#RequestErrorData}

從宣告過的非 2xx `output` 推出的錯誤 body。

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

給 `makeResponse` 的欄位：`status`、`statusText`、`url`、`headers`、`body`、`error`。
