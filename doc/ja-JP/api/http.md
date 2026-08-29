---
title: HTTP
description: defineRequest、execute options、HTTP の request/response 型です。
---

# HTTP

型付きリクエストを宣言し、入力からコマンドを組み立てて実行します。

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`、`path`、任意の `input` struct、status をキーにした `output`、任意の `operation` と `build` です。
- **戻り値** — ビルダーです。入力を渡すと `HttpCommand` になります。

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

`output` は `{ status, body }` グループのリストにもできます（複数コードで 1 つの body struct）。

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

`client.execute` が使う低レベル入口です。アプリコードでは `client.execute(command, options)` を呼んでください。

- **戻り値** — `[null, body, response]`、または `[error, undefined, response?]` です。

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

デフォルトの HTTP トランスポートです。`withHTTPHandle` で差し替えない限り使われます。

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

ネットワークなしで `HttpResponse` を作ります（インターセプター、テスト）。デフォルトの status は `0` です。`ok` は 2xx のとき true です。

## 実行 options

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

キャンセルは `abort` **または** `timeout` の一方だけで、両方は使えません。`signal` はどちらかと組み合わせられ、`abort` の別名では**ありません**。有効: `{ timeout }`、`{ abort }`、`{ signal, timeout }`、`{ signal, abort }`。無効: `{ abort, timeout }`。`timeout` は `1..2_147_483_647` の正の安全な整数である必要があります。

## 型

### RequestDefinition {#RequestDefinition}

`method`、`path`、任意の `input`、`output`、`responseType`（`'json' | 'text' | 'blob' | 'arraybuffer'`）、`operation`、任意の `build`（独自のリクエスト組み立て。`input` が必要です）。

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

正規化された送信リクエストです。`method`、`endpoint`、`headers`、`body`、`abort`、`operation`、progress フック、`baseEndpoint`、query メタデータ。

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

`loaded`、`total`、`lengthComputable` です。コールバックは async でも構いません。

[HTTP ガイド](../core/http.md) と [Commands](../core/commands.md) を見てください。

## ResponseGroupItem {#ResponseGroupItem}

`RequestOutputShape` のリスト形の 1 行 `{ status, body }` です。`status` は 1 コードでも、同じ body struct を共有する複数コードでも構いません。

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest` の戻り値です。input を渡して呼ぶと `HttpCommand` になります。

## HttpCommand {#HttpCommand}

リクエスト builder が出す不透明な command です。`client.execute` に渡します。

## UseRequestConfig {#UseRequestConfig}

進捗、キャンセルです。`HttpExecuteOptions` は `signal` を足します。

## RequestSuccessData {#RequestSuccessData}

宣言した 2xx の `output` から推論した成功 body です。

## RequestErrorData {#RequestErrorData}

宣言した非 2xx の `output` から推論したエラー body です。

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

`makeResponse` 用のフィールドです。`status`、`statusText`、`url`、`headers`、`body`、`error`。
