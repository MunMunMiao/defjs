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

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

エクスポートされているユニオン名は `RequestError<TErrorData>` です。

まず `kind`、必要に応じて次に `code` で分岐します。

### HTTP ステータスエラー

宣言済みの 2xx 以外の HTTP レスポンスは、次のエラーになります。

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

generic の順序はデータ、ステータスです。広い `RequestError<TErrorData>` export はアプリケーション境界で引き続き便利ですが、endpoint の実行結果はステータス別の `HttpStatusError<Data, Status>` branch のユニオンです。そのため、`error.status` を確認すると `error.data` はそのステータスで宣言した body に絞り込まれます。

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // この endpoint では、残りの 409 | 422 status は同じ conflict body を使います。
    console.error(error.data.conflict)
  }
}
```

`data` があるのは `HttpStatusError` だけです。endpoint 境界ではステータスと関連付いたこのユニオンを維持し、無関係なデータユニオンへ広げないでください。

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

### ネイティブ `Error` へのブリッジ

一部の統合ではネイティブ `Error` の throw が必要です。その境界で新しい診断エラーを作り、デフォルトでは安定した `kind`、`code`、取得可能な HTTP `status` の分類だけを公開します。

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

新しく作成したエラーは、境界で生成された自身の stack を保持します。未加工の `cause`、cause のメッセージや stack frame、`data`、レスポンスヘッダーやボディ、リクエストとレスポンスの URL は一切添付もコピーもしません。stack frame の文字列自体に URL や secret が含まれることがあるため、選択した cause frame のコピーも安全なデフォルトではありません。実行可能な `examples/observability-redacted-logging` プロジェクトでは、404 ステータスが保持されることを検証し、レスポンスデータと secret を意図的に含めた cause stack が漏れないことも確認しています。

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
