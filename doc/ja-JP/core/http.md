---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-schema mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

`defineRequest` を使って HTTP エンドポイントを定義し、`Client.execute()` で実行します。コアパッケージは、スキーマ検証、ステータスコードディスパッチ、シグナルマージ、レスポンスボディパースを自動的に処理します。

## エンドポイントの定義

`defineRequest` は `method`、`path`、`input`（オプション）、`output`（オプション）、`build`（オプション）を含む定義オブジェクトを受け取ります。

`input` を提供する場合、`build` も提供して、入力フィールドがリクエストの各部分（パスパラメーター、クエリパラメーター、ヘッダー、ボディ）にどうマッピングされるかを記述する必要があります。

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

入力が不要な場合は、`input` と `build` の両方を省略します：

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

## ステータスコードからスキーマへの出力マッピング

`output` は HTTP ステータスコードをスキーマにマッピングします。実行時はレスポンスのステータスコードに一致するスキーマを選択します。

オブジェクト形式と配列形式の両方がサポートされています：

```typescript
import { defineRequest, object, string } from '@defjs/core'

// オブジェクト形式: キーがステータスコード、値がスキーマ
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

// 配列形式: 複数のステータスコードを同じスキーマにマッピング可能
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

サーバーが `output` に宣言されていないステータスコードを返した場合、リクエストは `code` が `UNDECLARED_STATUS` の `DefinitionError` で失敗します。

## 成功／エラーデータの型推論

`output` が TypeScript の型推論を駆動します。`Client.execute()` は `HttpAwaitResult` を返し、2xx の成功データと非 2xx のエラーデータを自動的に区別します。

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
  // result は { id: number; name: string } として型付けされる
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data は { field: string; reason: string } | { traceId: string } として型付けされる
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### 型ヘルパー

- `RequestSuccessData<TOutput>`：`output` からすべての 2xx スキーマ出力型を抽出します。2xx マッピングが存在しない場合は `unknown` を推論します。
- `RequestErrorData<TOutput>`：`output` からすべての非 2xx スキーマ出力型を抽出します。非 2xx マッピングが存在しない場合は `unknown` を推論します。

## リクエストの実行

コマンドを `Client.execute()` に渡します。第 2 引数はオプションの `HttpExecuteOptions` です：

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* インターセプターが読み取れるカスタムコンテキスト */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // abort のエイリアス。等価
})
```

返される `HttpAwaitResult` はトリプレットです：

| 位置 | 型                                       | 意味                                                         |
| ---- | ---------------------------------------- | ------------------------------------------------------------ |
| 0    | `RequestError<TErrorData> \| null`       | エラーオブジェクト。成功時は `null`                          |
| 1    | `TSuccess \| undefined`                  | 成功データ。失敗時は `undefined`                             |
| 2    | `SettledResponse<TSuccess> \| undefined` | `status`、`headers`、`body` などを含む生のレスポンスラッパー |

## キャンセルとタイムアウト

`abort`、`timeout`、`signal` はリクエストライフサイクルを制御します。**`abort` と `timeout` は同時に使用できません** — 同時に使用すると、リクエスト送信前に検証エラーが発生します。

### AbortSignal の使用

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// 後からキャンセル
controller.abort()

// キャンセル後、error.kind は 'transport'、code は 'ABORTED'
```

### タイムアウトの使用

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5 秒のタイムアウト
})

// タイムアウト後、error.kind は 'transport'、code は 'TIMEOUT'
```

### 外部シグナルのマージ

`abort` と `signal` の両方が渡された場合、フレームワークは単一の `AbortSignal` にマージします。`timeout` も `AbortSignal.timeout()` として参加します。いずれかのシグナルがトリガーするとリクエストを中断します。

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // abort とマージされる
})
```

### エラーの区別

キャンセルとタイムアウトは両方とも `TransportError` ですが、`error.code` で区別できます：

| 状況             | `error.code`    | 説明                                                            |
| ---------------- | --------------- | --------------------------------------------------------------- |
| 手動キャンセル   | `ABORTED`       | `controller.abort()` または外部シグナルがトリガー               |
| タイムアウト     | `TIMEOUT`       | `timeout` が期限切れ、または `AbortSignal.timeout()` がトリガー |
| ネットワーク障害 | `NETWORK_ERROR` | fetch からのその他の例外                                        |

## ダウンロード／アップロード進捗

`onDownloadProgress` と `onUploadProgress` で進捗を追跡します。

### ダウンロード進捗

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` は 3 つのフィールドを含みます：

- `lengthComputable`：サーバーが `Content-Length` を返したかどうか
- `loaded`：これまでに受信したバイト数
- `total`：総バイト数（`lengthComputable` が `true` の場合のみ有効）

### アップロード進捗

アップロード進捗は、リクエストボディが `ReadableStream<Uint8Array>` の場合のみ機能します。フレームワークはストリームをラップし、各チャンク後にコールバックを呼び出します。

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

## レスポンスタイプ

デフォルトでは、`output` が宣言されている場合、フレームワークはレスポンスを自動的に `json` としてパースします。`responseType` で上書きすることも、`output` が `undefined` の場合に指定することもできます。

```typescript
import { defineRequest } from '@defjs/core'

// 明示的なレスポンスタイプ
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// 出力なし。生のレスポンスのみを関心
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

サポートされる `responseType` の値：

| 値            | 説明                                                            |
| ------------- | --------------------------------------------------------------- |
| `json`        | テキストを読み取って `JSON.parse()`。空のボディは `null` を返す |
| `text`        | テキスト文字列を直接返す                                        |
| `blob`        | `Blob` を返す                                                   |
| `arraybuffer` | `ArrayBuffer` を返す                                            |

`responseType` が `json` で、`output` が返されたステータスコードに対してスキーマを定義している場合、フレームワークはパース済み JSON をスキーマに対して検証します。検証に失敗すると、`code: 'RESPONSE_VALIDATION_FAILED'` の `DefinitionError` が返されます。

## 次に読む

- [Client →](/core/client) — `Client` の作成、インターセプター、XSRF、グローバルオプション
- [SSE →](/core/sse) — Server-Sent Events とストリーミングレスポンス
- [WebSocket →](/core/web-socket) — 双方向リアルタイム通信
