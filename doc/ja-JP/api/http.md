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

- **definition** — `method`、`path`、任意の `input` struct、任意の `output` と `error` struct、任意の `operation` と `build`。
- **戻り値** — ビルダーです。入力を渡すと `HttpCommand` になります。

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})
```

`output` は 2xx ボディ用の単一の struct、`error` は 2xx 以外すべてのボディ用の単一の struct です。どちらも status でキー分けされません。省いた側のボディは読まれません — [宣言は断言である](/ja-JP/guide/design-decisions#宣言は断言である) を参照してください。

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

`client.execute` が使う低レベル入口です。アプリコードでは `client.execute(command, options)` を呼んでください。

- **戻り値** `[null, data, response]` または `[fault, undefined, undefined]`。

2xx 以外の status は常に `HTTP_STATUS` です。`error` を宣言していればその `data` はデコード済みのエラーボディ、していなければ `undefined` です。失敗時のタプル第三要素は `undefined` で、レスポンスのメタデータは fault が持ちます。

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

デフォルトの HTTP トランスポートです。`withHTTPHandle` で差し替えない限り使われます。 レスポンスがクライアントに届かなかったときは、合成レスポンスを返すのではなく reject します。

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

ネットワークなしで `HttpResponse` を作ります（インターセプター、テスト）。デフォルトの status は `0` です。`ok` は 2xx のとき true です。 返る値は、回線から来たレスポンスとまったく同じメディアタイプ確認と宣言 struct を通ります。信頼による短絡経路はありません。

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

`method`、`path`、任意の `input`、`output`、`error`、`responseType`（`'json' | 'text' | 'blob' | 'arraybuffer'`）、`operation`、任意の `build`（リクエストを自分で組む。`input` が必要）。

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

`RequestDefinition` の `output` / `error` の側です。どちらも無い場合は `responseType` も拒否されます。何もデコードしないので、選ぶ対象がありません。

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

成功時、第三要素が `body` を持つのは `output` を宣言していたときだけです。失敗時は `undefined` で、存在したレスポンスのメタデータはすでに fault が抱えています。

### HttpRequest {#HttpRequest}

正規化された送信リクエストです。`method`、`endpoint`、`headers`、`body`、`abort`、`operation`、progress フック、`baseEndpoint`、query メタデータ。

### HttpMeta {#HttpMeta}

```ts
type HttpMeta = {
  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly url: string
}
```

レスポンスのメタデータで、レスポンスがクライアントに届いていれば常にあります。`body` は**持ちません**。ボディは、宣言された struct がデコードしたあとにだけ存在します。

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

ボディが宣言された struct でデコードできたレスポンスです。この型を手にしていること自体がデコードが起きた証拠であり、だからデコード失敗は `HttpMeta` だけを報告します。

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly ok: boolean
}
```

トランスポートが作り、インターセプターが見る回線上の形です。`body` はテキストかパース済みの JSON で、デコード済みの値ではありません。呼び出し側に届くのは `DecodedResponse` です。

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`、`total`、`lengthComputable` です。コールバックは async でも構いません。

[HTTP ガイド](../core/http.md) と [Commands](../core/commands.md) を見てください。 コールバックが throw したら `EXT_OBSERVER_FAILED` です。

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest` の戻り値です。input を渡して呼ぶと `HttpCommand` になります。

## HttpCommand {#HttpCommand}

リクエスト builder が出す不透明な command です。`client.execute` に渡します。

## UseRequestConfig {#UseRequestConfig}

進捗、キャンセルです。`HttpExecuteOptions` は `signal` を足します。

## RequestSuccessData {#RequestSuccessData}

宣言された `output` struct から推論される成功ボディ。宣言がなければ `undefined`。

## RequestErrorData {#RequestErrorData}

宣言された `error` struct から推論されるエラーボディ。宣言がなければ `undefined`。

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

`makeResponse` 用のフィールドです。`status`、`statusText`、`url`、`headers`、`body`、`request`。
