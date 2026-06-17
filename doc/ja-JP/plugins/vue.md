---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` は `@defjs/core` の Vue 3 プラグインです。アプリケーションレベルで `Client` インスタンスを登録する `provideClient` と、コンポーネントや composable 内でそのインスタンスにアクセスする `injectClient` を提供します。

両方とも `@defjs/core` から同じ設定ヘルパー `withEndpoint` と `withInterceptors` を共有します。

## インストール

```bash
npm install @defjs/vue @defjs/core
# または
pnpm add @defjs/vue @defjs/core
# または
bun add @defjs/vue @defjs/core
```

## クイックスタート

### 1. アプリケーションエントリでクライアントを提供する

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` は標準的な Vue プラグインを返します。内部では `app.provide()` を使って `Client` インスタンスをアプリケーションコンテキストに注入します。すべての子コンポーネントは `injectClient()` でアクセスできます。

### 2. コンポーネントで注入して使用する

```typescript
// UserCard.vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineRequest, struct } from '@defjs/core'

const client = injectClient()

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
      email: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser())
  if (error) {
    console.error('Request failed:', error.code, error.message)
    return
  }
  console.log(user.id, user.name, user.email) // 完全に型付き
}
</script>
```

## インターセプターの設定

`withInterceptors` を使ってファクトリー関数の配列を登録します。各ファクトリーはプラグインインストール時に実行され、返されたインターセプターインスタンスがクライアントに登録されます。

```typescript
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((req, next) => {
  req.headers.set('Authorization', `Bearer ${localStorage.getItem('token')}`)
  return next(req)
})

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)
```

> 注意: `withInterceptors` は**ファクトリー関数**（`() => Interceptor`）を受け付けます。インターセプターインスタンスではありません。これにより Vue provide フェーズでのオンデマンドインスタンス作成が可能になります。

## SSE と WebSocket の例

クライアントインスタンスは、コアパッケージと同じ使い方で SSE と WebSocket をサポートします：

```typescript
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineEventStream, defineWebSocket, struct } from '@defjs/core'

const client = injectClient()

// SSE
const notifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({ id: struct.number(), text: struct.string() }),
  },
})

const [error, stream] = await client.execute(notifications())
if (!error) {
  for await (const event of stream) {
    console.log(event.message) // typed as { id: number, text: string }
  }
}

// WebSocket
const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})

const [wsError, ws] = await client.execute(chat())
if (!wsError) {
  ws.send({ type: 'send', data: { text: 'Hello' } })
  for await (const msg of ws.receive) {
    console.log(msg.message)
  }
}
</script>
```

トランスポートの詳細については以下を参照してください：

- [Core Docs](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` の完全な使い方
- [SSE Docs](/core/sse) — SSE 自動再接続、ハートビート、バックプレッシャー
- [WebSocket Docs](/core/web-socket) — WebSocket 接続とメッセージタイプ

## API リファレンス

### `provideClient(...feature: ClientOption[]): Plugin`

Vue プラグインを作成します。インストール時に `createClient(...)` を介して `Client` インスタンスを構築し、`HTTP_CLIENT` を Injection Key としてアプリケーションコンテキストに提供します。

### `injectClient(): Client`

コンポーネント `setup` または composable 内で呼び出して、注入された Client インスタンスを取得します。先に `app.use(provideClient(...))` を呼び出していない場合、実行時エラーがスローされます：

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

HTTP リクエストのベース URL を設定します。省略した場合、リクエストのプレフィックスとしてデフォルトで `document.location.origin` が使用されます。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

インターセプターを設定します。各ファクトリーはプラグインインストール時に実行され、返されたインターセプターは登録順にオニオンモデルの呼び出し連鎖を形成します。

### `HTTP_CLIENT`

Vue の `InjectionKey<Client>` で、基盤の `provide` / `inject` キーとして使用されます。通常、直接必要になることはありませんが、カスタム注入階層で利用できます：

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## 次に読む

- [Core Docs](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` の完全な使い方
