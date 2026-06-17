---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` — это Vue 3 плагин для `@defjs/core`. Он предоставляет `provideClient` для регистрации экземпляра `Client` на уровне приложения, и `injectClient` для доступа к этому экземпляру внутри компонентов или composables.

Оба разделяют одинаковые помощники конфигурации `withEndpoint` и `withInterceptors` из `@defjs/core`.

## Установка

```bash
npm install @defjs/vue @defjs/core
# или
pnpm add @defjs/vue @defjs/core
# или
bun add @defjs/vue @defjs/core
```

## Быстрый старт

### 1. Предоставить клиента на уровне приложения

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` возвращает стандартный Vue Plugin. Внутри использует `app.provide()` для инжекции экземпляра `Client` в контекст приложения. Все дочерние компоненты могут получить доступ через `injectClient()`.

### 2. Инжектировать и использовать в компонентах

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
  console.log(user.id, user.name, user.email) // полностью типизировано
}
</script>
```

## Конфигурация перехватчиков

Используйте `withInterceptors` для регистрации массивов фабричных функций. Каждая фабрика выполняется во время установки плагина, и возвращённый экземпляр перехватчика регистрируется в Client.

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

> Примечание: `withInterceptors` принимает **фабричные функции** (`() => Interceptor`), а не экземпляры перехватчиков. Это позволяет создавать экземпляры по требованию во время Vue provide-фазы.

## Примеры SSE и WebSocket

Экземпляр Client поддерживает SSE и WebSocket с тем же использованием, что и core-пакет:

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
    console.log(event.message) // типизировано как { id: number, text: string }
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

Для деталей транспортов см.:

- [Core Docs](/core/client) — Полное использование `defineRequest`, `defineEventStream`, `defineWebSocket`
- [SSE Docs](/core/sse) — SSE auto-reconnect, heartbeat и backpressure
- [WebSocket Docs](/core/web-socket) — WebSocket-соединение и типы сообщений

## Справка по API

### `provideClient(...feature: ClientOption[]): Plugin`

Создаёт Vue Plugin. При установке конструирует экземпляр `Client` через `createClient(...)` и предоставляет его в контекст приложения с использованием `HTTP_CLIENT` как Injection Key.

### `injectClient(): Client`

Вызывать внутри component `setup` или composables для получения инжектированного экземпляра Client. Если `app.use(provideClient(...))` не был вызван ранее, выбрасывается runtime-ошибка:

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

Конфигурирует базовый URL для HTTP-запросов. Если опущен, запросы по умолчанию используют `document.location.origin` как префикс.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Конфигурирует перехватчики. Каждая фабрика выполняется во время установки плагина, и возвращённые перехватчики формируют луковичную цепочку вызовов в порядке регистрации.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`, используемый как ключ для нижележащего `provide` / `inject`. Обычно не требуется напрямую, но доступен для пользовательских иерархий инжекции:

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## Что дальше

- [Core Docs](/core/client) — Полное использование `defineRequest`, `defineEventStream`, `defineWebSocket`
