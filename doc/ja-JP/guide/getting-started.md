---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# はじめに

Defjs は、型付きリクエスト API を定義し、複数のトランスポートと JavaScript ランタイムで実行できる TypeScript ライブラリです。

## インストール

お好みのパッケージマネージャーをご利用ください：

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## CDN 利用

ビルドツールなしで ES モジュールとして直接インポートできます：

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## 最初のリクエストまでの 3 ステップ

### ステップ 1: クライアントを作成する

クライアントはすべてのリクエスト実行の入り口です。`createClient` を使ってインスタンスを作成し、ベースエンドポイントを設定します：

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### ステップ 2: リクエストを定義する

`defineRequest` を使って型付き HTTP エンドポイントを定義します。入力やレスポンスの形状を `struct` で記述します：

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
`output` のキーは HTTP ステータスコードです。Defjs は実行時に一致するスキーマを自動的に選択し、TypeScript 型を適切に導出します。2xx レスポンスは成功データとして型付けされ、2xx 以外はエラーデータとして型付けされます。
:::

### ステップ 3: 実行する

リクエストコマンドとオプションの設定を `client.execute` に渡して呼び出します：

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error は output に定義された非 2xx スキーマに基づいて型付けされます
  console.error(error.code, error.message)
  return
}

// user は { id: number; name: string } として型付けされます
console.log(user.name)
```

## 完全な例

入力検証、出力検証、エラー処理、インターセプターを含むエンドツーエンドの例を示します：

```typescript
import { createClient, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

// 1. クライアントを作成
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. リクエストを定義
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': struct.string(),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. 実行
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## コア API クイックリファレンス

| API                    | 説明                                 | 代表的な使い方                                                                 |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `createClient`         | リクエストクライアントを作成         | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | HTTP エンドポイントを定義            | `defineRequest({ method: 'GET', path: '/user', output: [{ status: 200, body: UserStruct }] as const })` |
| `defineEventStream`    | SSE エンドポイントを定義             | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | WebSocket エンドポイントを定義       | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | スキーマビルダー                     | `struct.object({ id: struct.number() })`                                       |
| `.alias(name)`         | フィールドの wire 名エイリアス       | `struct.string().alias('user_name')`                                           |
| `withEndpoint`         | ベース URL を設定                    | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | インターセプターを登録               | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | クロスオリジンクレデンシャルを有効化 | `withCredentials(true)`                                                        |
| `withSSEOptions`       | SSE オプションを設定                 | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | WebSocket オプションを設定           | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## 次に読む

- [Client →](/core/client) — クライアントの作成、コマンドの実行、設定
- [Commands →](/core/commands) — `defineRequest`、`defineEventStream`、`defineWebSocket`
- [Errors →](/core/errors) — `RequestError` の構造と分岐パターン
