---
title: Errors
description: トランスポート別の結果タプルを処理し、プレーンオブジェクトである RequestError の判別可能なユニオンで分岐します。
---

# Errors

対応するすべてのトランスポートは、エラーを先頭に置く 3 要素タプルを返します。ただし、3 番目の要素はトランスポートごとに異なります。

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP はデコード済みデータと Defjs の `HttpResponse` ラッパーを返します。
- SSE は論理ストリームハンドルと起動時オープンスナップショットを返します。
- WebSocket は論理セッションと起動時接続スナップショットを返します。

失敗時は 2 番目の要素が `undefined` です。対応するスナップショットが作られる前に起動が失敗した場合、3 番目の要素も `undefined` になります。

## `RequestError`

`RequestError` はタプルで返る、判別用フィールドを持つプレーンオブジェクトです。ネイティブの `Error` クラスは継承していません。

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

エクスポートされているユニオン名は `RequestError<TErrorData>` です。

まず `kind`、必要に応じて次に `code` で分岐します。

### HTTP ステータスエラー

宣言済みの 2xx 以外の HTTP レスポンスは、次のエラーになります。

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

`data` があるのは `HttpStatusError` だけです。その型は、エンドポイントで宣言した 2xx 以外の出力ボディをまとめたユニオンです。現在、`error.status` を確認してもこのユニオンの型は絞り込まれません。ステータスごとにボディの形が異なる場合は、アプリケーション側で構造または判別フィールドを確認してください。

### トランスポートエラー

ネットワーク処理、キャンセル、タイムアウトの失敗は次のエラーになります。

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

トランスポートエラーに `data` と `response` フィールドはありません。

### 定義エラー

入力デコード、リクエスト構築、レスポンスデコード、未宣言の HTTP ステータスは、次のエラーになることがあります。

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| コード                       | 現在の発生条件                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 入力の構造デコード、リクエスト構築に失敗した、または `build` が無効なバインディングを生成した。 |
| `RESPONSE_VALIDATION_FAILED` | 宣言済みレスポンスまたは SSE の起動時レスポンスが構造・内容の検証に失敗した。                   |
| `UNDECLARED_STATUS`          | `output` が宣言されている状態で、対応する Struct のない HTTP ステータスが返った。               |

`UNDECLARED_STATUS` は、未対応の 2xx と 2xx 以外の両方に適用されます。

## 分岐

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

明示的なマスキングと保存ポリシーがない限り、`cause`、`data`、レスポンスヘッダー、ボディ、URL をログへ出さないでください。

## レスポンスの有無

`HttpResponse` は Defjs のラッパーであり、ネイティブの `Response` ではありません。ステータス、ステータステキスト、ヘッダー、URL、ボディ、`error`、`ok` を公開します。`ok` はステータスが 2xx であることだけを表します。`error` はトランスポートまたはボディ表現の失敗専用で、通常の 2xx 以外のレスポンスでは空です。

宣言済みで有効な 2xx 以外のボディは Struct でデコードされ、型付きの `HttpStatusError.data` として保持されます。不正な表現は代わりに `RESPONSE_VALIDATION_FAILED` となり、元の codec 例外を `cause`、受信済みなら response に保持し、`data` は持ちません。

HTTP では、次の規則になります。

- 宣言済み HTTP ステータスエラーには `error.response` があります。
- レスポンス出力の検証エラーと未宣言ステータスには `error.response` がある場合があります。
- リクエスト検証、レスポンス前のキャンセル、インターセプターによる例外の送出、ステータス 0 のトランスポート失敗では、タプルのレスポンスがない場合があります。

SSE の起動失敗でも、レスポンス到着後に内容またはステータスの検証が失敗した場合は、3 番目にオープンスナップショットを返すことがあります。WebSocket の起動失敗で接続スナップショットを返せるのは、スナップショットが取得済みの場合だけです。

## エラーファクトリーと定数

ルートエントリーは統合コード向けのファクトリーヘルパーをエクスポートしています。

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` は中断、タイムアウト、その他の原因を正規化します。
- `createDefinitionError(code, cause, response?)` は定義エラーを作ります。
- `createHttpStatusError(status, message, response, data?)` は HTTP ステータスエラーを作ります。
- `ERR_ABORTED` と `ERR_TIMEOUT` は正規化処理が認識する共有 `Error` 値です。

これらのヘルパーはプレーンな `RequestError` オブジェクトを作成し、例外としては送出しません。

組み込みのコマンド経路は、想定される起動時の失敗をタプルへ変換します。ただし、タプル処理が任意の拡張コードまで覆うわけではありません。カスタムインターセプターとアプリケーションコールバックは例外を送出することがあり、広いランタイム実装に未対応のコマンドを渡すと Promise が reject されます。

## 次に読む

- [HTTP](/ja-JP/core/http) — ステータスディスパッチとレスポンスデコード
- [SSE](/ja-JP/core/sse) — 起動失敗とオープン後のエラーの違い
- [WebSocket](/ja-JP/core/web-socket) — ランタイムエラーと終端クローズ
