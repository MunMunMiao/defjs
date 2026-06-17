---
title: 設計上の決定事項
description: 他の HTTP ライブラリの一般的なパターンとは異なる API 設計上の決定事項。
---

# 設計上の決定事項

Defjs は、他の HTTP ライブラリで見られる一般的なパターンとは意図的に異なる設計を採用しています。このドキュメントでは、それぞれの決定事項の設計根拠を説明します。

## 明示的なクライアント設計

Defjs はすべてのクライアントを明示的に作成する必要があります。`createClient` で `Client` を作成し、必要な場所に渡します。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

この設計の理由：

- **テストしやすい**：状態をリセットやモック化する必要がありません。異なる `Client` インスタンスをテストに直接渡せます。
- **マルチ環境の共存**：同一プロセス内で複数のクライアントを並行して実行できます（例：内部 API + 公開 API）。干渉はありません。
- **依存関係の透明性**：呼び出し側は明示的に `Client` を保持する必要があり、静的解析やコードレビューで依存関係が可視化されます。

アプリケーションで共有クライアントが必要な場合は、モジュールからエクスポートしてください：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## フレームワーク統合

`@defjs/angular`、`@defjs/vue`、`@defjs/react` は、明示的なクライアントを各フレームワークの依存モデルへ統合します。Angular と Vue は `provideClient` / `injectClient` を使い、React は `ClientProvider` / `useClient` を使います。これにより、クライアントはコンポーネントまたはサービスツリー内で登録および取得できます。

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // コンポーネントロジック内で client.execute(...) を使う
}
```

## リクエストレベルのオプションは `execute` に渡す、Builder ではない

リクエストレベルのオプション（`abort`、`timeout`、`heartbeat`、`reconnect` など）は、`client.execute` の第 2 引数で渡します。コマンドビルダーではありません。

```typescript
// 正しい：リクエストレベルのオプションは execute に渡す
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## コマンドタイプでオーバーロードされた `execute`

`client.execute` は `Command` タイプに基づいて、自動的に正しい結果型を返します。

```typescript
// HTTP リクエスト — HttpAwaitResult を返す
const [error, user, response] = await client.execute(httpCommand())

// SSE ストリーム — StreamAwaitResult を返す
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — SocketAwaitResult を返す
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` はオブザーバー

SSE の `onInvalidEvent` はオブザーバーです。内部で例外が発生しても静かに無視され、ストリームは中断されません。

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // たとえここでスローしても、ストリームは継続します
    },
  },
})
```

## エラーサブモジュールの統合

すべてのエラーシンボルは、メインの `@defjs/core` エントリポイントからエクスポートされます。

| エクスポート            | 説明                        | 典型的な使い方                                              |
| ----------------------- | --------------------------- | ----------------------------------------------------------- |
| `RequestError`          | エラー共用体型              | `switch (error.kind)` による分岐                            |
| `ERR_ABORTED`           | 中断識別子                  | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | タイムアウト識別子          | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | トランスポートエラーを作成  | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | 定義エラーを作成            | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | HTTP ステータスエラーを作成 | `createHttpStatusError(404, 'Not Found', response, data)`   |

メインエントリからインポート：

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## `kind` と `code` によるエラー分岐

Defjs は、文字列比較ではなく `kind` と `code` による分岐を推奨します。

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
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

## より厳密なエンドポイント定義ルール

Defjs は厳密なルールを適用します：**`build` を提供する場合は `input` も同時に提供する必要があります。**

```typescript
// 正しい：input と build の両方を持つ
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 正しい：input と build の両方を持たない
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// エラー：build はあるが input がない
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript エラー：input スキーマが不足
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

このルールは `defineEventStream` と `defineWebSocket` にも適用されます。

## 依存関係

| パッケージ       | 必要なバージョン |
| ---------------- | ---------------- |
| `@defjs/core`    | `^0.4.0`         |
| `@defjs/angular` | `19.x`           |
| `@defjs/vue`     | `^0.4.0`         |
| `@defjs/react`   | `^0.4.0`         |

Angular peer dependency 範囲：`>=18.0.0 <=22.0.0`。React peer dependency 範囲：`>=18.0.0`。Node ランタイム：`>=26`。

## 次に読む

- [Client →](/core/client) — 明示的なクライアント設計と設定
- [Commands →](/core/commands) — コマンド定義と入力ルール
- [Errors →](/core/errors) — `RequestError` の構造と分岐
