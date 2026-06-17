---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` is a Vue 3 plugin for `@defjs/core`. It provides `provideClient` to register a `Client` instance at the application level, and `injectClient` to access that instance inside components or composables.

Both functions share the same configuration helpers `withEndpoint` and `withInterceptors` from `@defjs/core`.

## Installation

```bash
npm install @defjs/vue @defjs/core
# or
pnpm add @defjs/vue @defjs/core
# or
bun add @defjs/vue @defjs/core
```

## Quick Start

### 1. Provide Client at Application Entry

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` returns a standard Vue Plugin. Internally it uses `app.provide()` to inject the `Client` instance into the application context. All child components can access it via `injectClient()`.

### 2. Inject and Use in Components

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

## Configuring Interceptors

Use `withInterceptors` to register factory function arrays. Each factory executes during plugin installation, and the returned interceptor instance is registered to the Client.

```typescript twoslash
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { createApp } from 'vue'

const app = createApp({})

const authInterceptor = createHttpInterceptor((req, next) => {
  req.headers ??= new Headers()
  req.headers.set('Authorization', 'Bearer token')
  return next(req)
})

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)
```

> Note: `withInterceptors` accepts **factory functions** (`() => Interceptor`), not interceptor instances. This allows on-demand instance creation during the Vue provide phase.

## SSE and WebSocket Examples

The Client instance supports SSE and WebSocket with the same usage as the core package:

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

For more transport details, see:

- [Core Docs](/core/client) — Full `defineRequest`, `defineEventStream`, `defineWebSocket` usage
- [SSE Docs](/core/sse) — SSE auto-reconnect, heartbeat, and backpressure
- [WebSocket Docs](/core/web-socket) — WebSocket connection and message types

## API Reference

### `provideClient(...feature: ClientOption[]): Plugin`

Creates a Vue Plugin. On installation, it constructs a `Client` instance via `createClient(...)` and provides it to the application context using `HTTP_CLIENT` as the Injection Key.

### `injectClient(): Client`

Call inside component `setup` or composables to retrieve the injected Client instance. If `app.use(provideClient(...))` was not called first, a runtime error is thrown:

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

Configures the base URL for HTTP requests. If omitted, requests default to `document.location.origin` as prefix.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Configures interceptors. Each factory executes during plugin installation, and returned interceptors form an onion-model call chain in registration order.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`, used for the underlying `provide` / `inject` key. Usually not needed directly, but available for custom injection hierarchies:

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## What's Next

- [Core Docs](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` full usage
