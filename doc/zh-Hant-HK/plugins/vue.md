---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` 將 `@defjs/core` 整合為 Vue 3 外掛。它提供 `provideClient` 在應用程式層級註冊 `Client` 實例，以及 `injectClient` 在元件或 Composition API 中存取該實例。

兩者共用來自 `@defjs/core` 的相同設定輔助函式 `withEndpoint` 與 `withInterceptors`。

## 安裝

```bash
npm install @defjs/vue @defjs/core
# or
pnpm add @defjs/vue @defjs/core
# or
bun add @defjs/vue @defjs/core
```

## 快速開始

### 1. 在應用程式入口提供用戶端

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` 回傳標準 Vue 外掛。內部使用 `app.provide()` 將 `Client` 實例注入應用程式上下文。所有子元件皆可透過 `injectClient()` 存取。

### 2. 在元件中注入與使用

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
  console.log(user.id, user.name, user.email) // fully typed
}
</script>
```

## 設定攔截器

使用 `withInterceptors` 註冊工廠函式陣列。每個工廠在外掛安裝時執行，回傳的攔截器實例會註冊到 Client。

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

> 注意：`withInterceptors` 接受**工廠函式**（`() => Interceptor`），而非攔截器實例。這允許在 Vue provide 階段按需建立實例。

## SSE 與 WebSocket 範例

Client 實例支援 SSE 與 WebSocket，用法與核心套件相同：

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

更多傳輸細節請見：

- [核心檔案](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` 完整用法
- [SSE 檔案](/core/sse) — SSE 自動重連、心跳與背壓
- [WebSocket 檔案](/core/web-socket) — WebSocket 連線與訊息類型

## API 參考

### `provideClient(...feature: ClientOption[]): Plugin`

建立 Vue 外掛。安裝時，透過 `createClient(...)` 建構 `Client` 實例，並以 `HTTP_CLIENT` 作為 Injection Key 提供至應用程式上下文。

### `injectClient(): Client`

在元件 `setup` 或 composables 中呼叫以取得注入的 Client 實例。若未先呼叫 `app.use(provideClient(...))`，會拋出執行階段錯誤：

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

設定 HTTP 請求的基礎 URL。若省略，預設以 `document.location.origin` 作為前綴。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

設定攔截器。每個工廠在外掛安裝時執行，回傳的攔截器依註冊順序形成洋蔥模型呼叫鏈。

### `HTTP_CLIENT`

Vue 的 `InjectionKey<Client>`，作為底層 `provide` / `inject` 的鍵。通常無需直接使用，但可用於自訂注入層級：

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## 接下來

- [核心檔案](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` 完整用法
