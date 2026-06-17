---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` est un plugin Vue 3 pour `@defjs/core`. Il fournit `provideClient` pour enregistrer une instance `Client` au niveau de l'application, et `injectClient` pour y accéder dans les composants ou les composables.

Les deux fonctions partagent les mêmes helpers de configuration `withEndpoint` et `withInterceptors` depuis `@defjs/core`.

## Installation

```bash
npm install @defjs/vue @defjs/core
# or
pnpm add @defjs/vue @defjs/core
# or
bun add @defjs/vue @defjs/core
```

## Démarrage rapide

### 1. Fournir le client au point d'entrée de l'application

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` retourne un Plugin Vue standard. En interne il utilise `app.provide()` pour injecter l'instance `Client` dans le contexte applicatif. Tous les composants enfants peuvent y accéder via `injectClient()`.

### 2. Injecter et utiliser dans les composants

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

## Configurer les intercepteurs

Utilise `withInterceptors` pour enregistrer des tableaux de fonctions factory. Chaque factory s'exécute pendant l'installation du plugin, et l'instance d'intercepteur retournée est enregistrée sur le Client.

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

> Note : `withInterceptors` accepte des **fonctions factory** (`() => Interceptor`), pas des instances d'intercepteur. Cela permet la création d'instance à la demande pendant la phase de provide Vue.

## Exemples SSE et WebSocket

L'instance Client supporte SSE et WebSocket avec le même usage que le package core :

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
    console.log(event.message) // typé comme { id: number, text: string }
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

Pour plus de détails sur les transports, voir :

- [Core Docs](/core/client) — Usage complet de `defineRequest`, `defineEventStream`, `defineWebSocket`
- [SSE Docs](/core/sse) — Reconnexion automatique SSE, heartbeat et contre-pression
- [WebSocket Docs](/core/web-socket) — Connexion WebSocket et types de messages

## Référence API

### `provideClient(...feature: ClientOption[]): Plugin`

Crée un Plugin Vue. À l'installation, il construit une instance `Client` via `createClient(...)` et la fournit au contexte applicatif en utilisant `HTTP_CLIENT` comme Injection Key.

### `injectClient(): Client`

Appelle à l'intérieur du `setup` d'un composant ou dans des composables pour récupérer l'instance Client injectée. Si `app.use(provideClient(...))` n'a pas été appelé avant, une erreur runtime est levée :

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

Configure l'URL de base pour les requêtes HTTP. Si omis, les requêtes utilisent par défaut `document.location.origin` comme préfixe.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Configure les intercepteurs. Chaque factory s'exécute pendant l'installation du plugin, et les intercepteurs retournés forment une chaîne d'appels en modèle d'oignon dans l'ordre d'enregistrement.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`, utilisé comme clé sous-jacente pour `provide` / `inject`. Généralement pas nécessaire directement, mais disponible pour des hiérarchies d'injection personnalisées :

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## Prochaines étapes

- [Core Docs](/core/client) — Usage complet de `defineRequest`, `defineEventStream`, `defineWebSocket`
