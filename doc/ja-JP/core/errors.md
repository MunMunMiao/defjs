---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# エラー

`@defjs/core` ですべての実行結果は `[error, result, response]` のトリプレットとして返されます。`error` は `RequestError` です：`kind` と `code` を持つ判別共用体です。`kind` と `code` による分岐が推奨されるパターンであり、文字列比較は避けるべきです。

## RequestError の構造

`RequestError` は 3 つのエラータイプの共用体です：

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

すべてのエラーは以下の共通フィールドを持ちます：

| フィールド | 型                                      | 説明                                                            |
| ---------- | --------------------------------------- | --------------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | トップレベル分岐用のエラーカテゴリー                            |
| `code`     | `string`                                | 2 次レベル分岐用の正確なエラーコード                            |
| `message`  | `string`                                | 人間が読めるエラー説明                                          |
| `data`     | `unknown`                               | 追加データ（`http` と `definition` エラーのみ）                 |
| `response` | `SettledResponseLike`                   | 生のレスポンスオブジェクト（`http` と `definition` エラーのみ） |

### HttpStatusError

サーバーが `output` で定義された非 2xx ステータスコードを返した場合に生成されます。

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

`data` の型は、一致するステータスコードに対する `output` スキーマから導出されます。例えば、`output: { 404: notFoundStruct }` は `error.data` を `notFoundStruct` の推論型に絞り込みます。

### TransportError

ネットワークまたはトランスポート層の障害（中断、タイムアウト、一般的なネットワークエラー）が発生した場合に生成されます。

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

リクエスト定義または検証の失敗時に生成されます。

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| コード                       | トリガーとなる状況                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 入力パラメーターが `input` struct の検証に失敗した場合、または `build` が例外をスローした場合 |
| `RESPONSE_VALIDATION_FAILED` | レスポンスボディが返されたステータスコードに対する `output` struct の検証に失敗した場合       |
| `UNDECLARED_STATUS`          | サーバーが `output` に宣言されていない 2xx ステータスコードを返した場合                       |

## エラーの分類と分岐

**推奨しません**：文字列比較でエラータイプを判断することは避けてください：

```typescript
// 非推奨: 壊れやすく、型絞り込みができません
if (error.message.includes('timeout')) { ... }
```

**推奨**：正確な型絞り込みのため、`kind` と `code` で分岐してください：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error は HttpStatusError に絞り込まれます
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data は { code: string; message: string } に絞り込まれます
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error は TransportError に絞り込まれます
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      // error は DefinitionError に絞り込まれます
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## ビルトイン定数

`@defjs/core` は、特定のトランスポートエラーを識別するための 2 つの定数をエクスポートします：

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: リクエストが能動的にキャンセルされた
// ERR_TIMEOUT: リクエストがタイムアウトした
```

### インターセプター内でのキャンセル発火

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### AbortController との組み合わせ

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### トランスポートエラーの手動作成

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## ヘルパー関数

### `createTransportError`

生の例外を `TransportError` に正規化します。

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

生の例外を `DefinitionError` に正規化します。

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

非 2xx レスポンスを `HttpStatusError` に正規化します。

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## 次に読む

- [Client →](/core/client) — クライアントの作成とコマンドの実行
- [HTTP Requests →](/core/http) — `defineRequest` と出力パターン
- [SSE →](/core/sse) — SSE のエラーと再接続戦略
- [WebSocket →](/core/web-socket) — WebSocket の接続エラー処理
