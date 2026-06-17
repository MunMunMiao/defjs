---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` ist ein Vue-3-Plugin für `@defjs/core`. Es stellt `provideClient` bereit, um eine `Client`-Instanz auf Anwendungsebene zu registrieren, und `injectClient`, um auf diese Instanz in Komponenten oder Composables zuzugreifen.

Beide Funktionen nutzen dieselben Konfigurations-Helper `withEndpoint` und `withInterceptors` aus `@defjs/core`.

## Installation

```bash
npm install @defjs/vue @defjs/core
# or
pnpm add @defjs/vue @defjs/core
# or
bun add @defjs/vue @defjs/core
```

## Schnellstart

### 1. Client am Application-Entry bereitstellen

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` gibt ein Standard-Vue-Plugin zurück. Intern verwendet es `app.provide()`, um die `Client`-Instanz in den Anwendungskontext zu injizieren. Alle Child-Komponenten können sie über `injectClient()` abrufen.

### 2. In Komponenten injizieren und verwenden

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

## Interceptors konfigurieren

Verwende `withInterceptors`, um Factory-Funktions-Arrays zu registrieren. Jede Factory wird während der Plugin-Installation ausgeführt, und die zurückgegebene Interceptor-Instanz wird beim Client registriert.

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

> Hinweis: `withInterceptors` akzeptiert **Factory-Funktionen** (`() => Interceptor`), nicht Interceptor-Instanzen. Das ermöglicht On-Demand-Instanzerstellung während der Vue-Provide-Phase.

## SSE- und WebSocket-Beispiele

Die Client-Instanz unterstützt SSE und WebSocket mit derselben Nutzung wie das Core-Paket:

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

Für mehr Transport-Details siehe:

- [Core-Docs](/core/client) — Vollständige `defineRequest`, `defineEventStream`, `defineWebSocket`-Nutzung
- [SSE-Docs](/core/sse) — SSE-Auto-Wiederverbindung, Heartbeat und Backpressure
- [WebSocket-Docs](/core/web-socket) — WebSocket-Verbindung und Message-Typen

## API-Referenz

### `provideClient(...feature: ClientOption[]): Plugin`

Erstellt ein Vue-Plugin. Bei Installation konstruiert es eine `Client`-Instanz via `createClient(...)` und stellt sie dem Anwendungskontext über `HTTP_CLIENT` als Injection Key bereit.

### `injectClient(): Client`

Ruf innerhalb von Komponenten-`setup` oder Composables auf, um die injizierte Client-Instanz abzurufen. Falls `app.use(provideClient(...))` nicht vorher aufgerufen wurde, wird ein Laufzeitfehler geworfen:

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

Konfiguriert die Basis-URL für HTTP-Requests. Falls weggelassen, defaulten Requests auf `document.location.origin` als Präfix.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Konfiguriert Interceptors. Jede Factory wird während der Plugin-Installation ausgeführt, und zurückgegebene Interceptors formen eine Zwiebelmodell-Call-Chain in Registrierungsreihenfolge.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`, verwendet als zugrunde liegender `provide` / `inject`-Key. Normalerweise nicht direkt nötig, aber verfügbar für eigene Injection-Hierarchien:

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## Wie geht es weiter

- [Core-Docs](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` vollständige Nutzung
