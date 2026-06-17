---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` es un plugin de Vue 3 para `@defjs/core`. Proporciona `provideClient` para registrar una instancia de `Client` a nivel de aplicación, e `injectClient` para acceder a esa instancia dentro de componentes o composables.

Ambas funciones comparten los mismos helpers de configuración `withEndpoint` y `withInterceptors` de `@defjs/core`.

## Instalación

```bash
npm install @defjs/vue @defjs/core
# or
pnpm add @defjs/vue @defjs/core
# or
bun add @defjs/vue @defjs/core
```

## Inicio rápido

### 1. Proveer el cliente en la entrada de la aplicación

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` devuelve un Plugin de Vue estándar. Internamente usa `app.provide()` para inyectar la instancia de `Client` en el contexto de la aplicación. Todos los componentes hijos pueden acceder a ella mediante `injectClient()`.

### 2. Inyectar y usar en componentes

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
  console.log(user.id, user.name, user.email) // totalmente tipado
}
</script>
```

## Configurar interceptores

Usa `withInterceptors` para registrar matrices de funciones factory. Cada factory se ejecuta durante la instalación del plugin, y la instancia de interceptor devuelta se registra en el Client.

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

> Nota: `withInterceptors` acepta **funciones factory** (`() => Interceptor`), no instancias de interceptor. Esto permite la creación de instancias bajo demanda durante la fase de provide de Vue.

## Ejemplos SSE y WebSocket

La instancia de Client soporta SSE y WebSocket con el mismo uso que el paquete core:

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
    console.log(event.message) // tipado como { id: number, text: string }
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

Para más detalles de transporte, consulta:

- [Core Docs](/core/client) — Uso completo de `defineRequest`, `defineEventStream`, `defineWebSocket`
- [SSE Docs](/core/sse) — Reconexión automática SSE, latido y contrapresión
- [WebSocket Docs](/core/web-socket) — Conexión WebSocket y tipos de mensaje

## Referencia de API

### `provideClient(...feature: ClientOption[]): Plugin`

Crea un Plugin de Vue. En instalación, construye una instancia de `Client` mediante `createClient(...)` y la proporciona al contexto de aplicación usando `HTTP_CLIENT` como Injection Key.

### `injectClient(): Client`

Llama dentro del `setup` de un componente o composables para recuperar la instancia de Client inyectada. Si `app.use(provideClient(...))` no fue llamado primero, se lanza un error de runtime:

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

Configura la URL base para peticiones HTTP. Si se omite, las peticiones por defecto usan `document.location.origin` como prefijo.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Configura interceptores. Cada factory se ejecuta durante la instalación del plugin, y los interceptores devueltos forman una cadena de llamada en modelo de cebolla en orden de registro.

### `HTTP_CLIENT`

`InjectionKey<Client>` de Vue, usado como clave subyacente de `provide` / `inject`. Generalmente no se necesita directamente, pero disponible para jerarquías de inyección personalizadas:

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## Qué sigue

- [Core Docs](/core/client) — Uso completo de `defineRequest`, `defineEventStream`, `defineWebSocket`
