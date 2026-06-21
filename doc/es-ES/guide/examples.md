---
title: Examples
description: Complete, runnable code snippets covering REST CRUD, SSE, WebSocket, interceptor patterns, and Angular / Vue integration.
---

# Ejemplos

Esta página proporciona ejemplos listos para copiar y pegar para los casos de uso más comunes.

## CRUD REST

### Definir esquemas y endpoints

```typescript
import { createClient, defineRequest, struct, withEndpoint, RequestError } from '@defjs/core'

// Modelos de datos
const UserStruct = struct.object({
  id: struct.number(),
  name: struct.string(),
  email: struct.string(),
})

const UserListStruct = struct.object({
  items: struct.array(UserStruct),
  total: struct.number(),
})

const CreateUserInput = struct.object({
  name: struct.string(),
  email: struct.string(),
  role: struct.string().alias('role'),
})

// Definiciones de peticiones
const createUser = defineRequest({
  method: 'POST',
  path: '/v1/users',
  input: CreateUserInput,
  build: (input) => ({
    body: input,
  }),
  output: {
    201: UserStruct,
    400: struct.object({ message: struct.string() }),
  },
})

const listUsers = defineRequest({
  method: 'GET',
  path: '/v1/users',
  output: {
    200: UserListStruct,
  },
})

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.object({
    id: struct.number().alias('id'),
  }),
  build: (input) => ({
    params: { id: input.id },
  }),
  output: {
    200: UserStruct,
    404: struct.object({ message: struct.string() }),
  },
})

const updateUser = defineRequest({
  method: 'PUT',
  path: '/v1/users/:id',
  input: struct.object({
    id: struct.number().alias('id'),
    name: struct.string(),
    email: struct.string(),
  }),
  build: (input) => ({
    params: { id: input.id },
    body: { name: input.name, email: input.email },
  }),
  output: {
    200: UserStruct,
    404: struct.object({ message: struct.string() }),
  },
})

const deleteUser = defineRequest({
  method: 'DELETE',
  path: '/v1/users/:id',
  input: struct.object({
    id: struct.number().alias('id'),
  }),
  build: (input) => ({
    params: { id: input.id },
  }),
  output: {
    204: struct.unknown(),
    404: struct.object({ message: struct.string() }),
  },
})
```

### Ejecutar

```typescript
const client = createClient(withEndpoint('https://api.example.com'))

async function handleCreate() {
  const [error, user] = await client.execute(createUser({ name: 'Alice', email: 'alice@example.com', role: 'admin' }))
  if (error) {
    handleError(error)
    return
  }
  console.log('Created:', user)
}

async function handleList() {
  const [error, list] = await client.execute(listUsers())
  if (error) {
    handleError(error)
    return
  }
  console.log('Total:', list.total)
}

async function handleGet(id: number) {
  const [error, user] = await client.execute(getUser({ id }))
  if (error) {
    handleError(error)
    return
  }
  console.log('User:', user.name)
}

async function handleUpdate(id: number) {
  const [error, user] = await client.execute(updateUser({ id, name: 'Bob', email: 'bob@example.com' }))
  if (error) {
    handleError(error)
    return
  }
  console.log('Updated:', user)
}

async function handleDelete(id: number) {
  const [error] = await client.execute(deleteUser({ id }))
  if (error) {
    handleError(error)
    return
  }
  console.log('Deleted')
}
```

### Manejo de errores

```typescript
function handleError(error: RequestError<unknown>) {
  switch (error.kind) {
    case 'transport':
      console.error('Network error:', error.code, error.message)
      break
    case 'definition':
      console.error('Struct error:', error.code, error.message)
      break
    case 'http':
      console.error('HTTP error:', error.status, error.message)
      console.error('Error data:', error.data)
      break
  }
}
```

## Notificaciones SSE en tiempo real

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1000,
    factor: 2,
    maxDelayMs: 30000,
  }),
)

const notificationStream = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.string(),
      content: struct.string(),
      timestamp: struct.number(),
    }),
    alert: struct.object({
      level: struct.enum(['info', 'warning', 'critical'] as const),
      title: struct.string(),
    }),
    default: struct.string(),
  },
})

async function listenNotifications() {
  const [error, stream, open] = await client.execute(notificationStream())

  if (error) {
    console.error('Failed to connect:', error.message)
    return
  }

  console.log('Connected:', open.url, open.response?.status)

  for await (const event of stream) {
    switch (event.event) {
      case 'message':
        console.log('Message:', event.data.content)
        break
      case 'alert':
        console.log('Alert:', event.data.level, event.data.title)
        break
      default:
        console.log('Unknown event:', event.data)
        break
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code, closeInfo.reason)
}
```

## Sala de chat WebSocket

```typescript
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect, withWebSocketHeartbeat } from '@defjs/core'

const client = createClient(
  withEndpoint('wss://chat.example.com'),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 2000,
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
)

const chatRoom = defineWebSocket({
  path: '/room/:roomId',
  input: struct.object({
    roomId: struct.string().alias('roomId'),
  }),
  build: (input) => ({
    params: { roomId: input.roomId },
  }),
  incoming: {
    message: struct.object({
      userId: struct.string(),
      text: struct.string(),
      sentAt: struct.number(),
    }),
    userJoined: struct.object({
      userId: struct.string(),
      userName: struct.string(),
    }),
    userLeft: struct.object({
      userId: struct.string(),
    }),
  },
  outgoing: {
    sendMessage: struct.object({
      text: struct.string(),
    }),
  },
})

async function joinChat(roomId: string) {
  const [error, session, connection] = await client.execute(chatRoom({ roomId }))

  if (error) {
    console.error('Connection failed:', error.message)
    return
  }

  console.log('Joined room:', connection.url, connection.protocol)

  session.onStateChange((state) => {
    console.log('WebSocket state:', state)
  })

  session.onRuntimeError((err) => {
    console.error('Runtime error:', err)
  })

  session.send({ type: 'sendMessage', data: { text: 'Hello everyone!' } })

  for await (const msg of session.receive) {
    switch (msg.type) {
      case 'message':
        console.log(`${msg.data.userId}: ${msg.data.text}`)
        break
      case 'userJoined':
        console.log(`${msg.data.userName} joined`)
        break
      case 'userLeft':
        console.log(`${msg.data.userId} left`)
        break
    }
  }

  const closeInfo = await session.closed
  console.log('Closed:', closeInfo.code, closeInfo.reason)
}
```

## Composición de interceptores

### Autenticación

```typescript
import {
  createClient,
  createHttpInterceptor,
  createSSEInterceptor,
  createWebSocketInterceptor,
  withInterceptors,
  withEndpoint,
} from '@defjs/core'

function authInterceptor(getToken: () => string | null) {
  const apply = (req: HttpRequest) => {
    const token = getToken()
    if (!token) return req
    const headers = new Headers(req.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return { ...req, headers }
  }

  return [
    createHttpInterceptor((req, next) => next(apply(req))),
    createSSEInterceptor((req, next) => next(apply(req))),
    createWebSocketInterceptor((req, next) => next(apply(req))),
  ]
}

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(...authInterceptor(() => localStorage.getItem('token'))),
)
```

### Registro

```typescript
function loggingInterceptor() {
  return createHttpInterceptor(async (req, next) => {
    const start = performance.now()
    console.log(`[HTTP] ${req.method} ${req.url}`)

    try {
      const response = await next(req)
      const duration = (performance.now() - start).toFixed(2)
      console.log(`[HTTP] ${req.method} ${req.url} — ${response.status} (${duration}ms)`)
      return response
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2)
      console.error(`[HTTP] ${req.method} ${req.url} — ERROR (${duration}ms)`, error)
      throw error
    }
  })
}
```

## Integración Angular

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { authInterceptor } from './interceptors'

export const appConfig: ApplicationConfig = {
  providers: [
    provideClient(
      withEndpoint('https://api.example.com'),
      withInterceptors(() => authInterceptor()),
    ),
  ],
}
```

```typescript
// user.component.ts
import { Component } from '@angular/core'
import { injectClient } from '@defjs/angular'
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ name: struct.string() }),
  },
})

@Component({
  selector: 'app-user',
  template: `<button (click)="loadUser()">Load User</button>`,
})
export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(getUser())
    if (error) {
      console.error('Failed:', error.message)
      return
    }
    console.log('User:', user.name)
  }
}
```

## Integración Vue

```typescript
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { authInterceptor } from './interceptors'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com'), withInterceptors(authInterceptor)))

app.mount('#app')
```

```vue
<!-- UserCard.vue -->
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineRequest, struct } from '@defjs/core'

const client = injectClient()

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ name: struct.string() }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser())
  if (error) {
    console.error('Failed:', error.message)
    return
  }
  console.log('User:', user.name)
}
</script>

<template>
  <button @click="loadUser">Load User</button>
</template>
```

## Hoja de referencia rápida de la API

| Export                                                                                      | Uso típico                     |
| ------------------------------------------------------------------------------------------- | ------------------------------ |
| `createClient(...options)`                                                                  | Crear una instancia de cliente |
| `withEndpoint(url)`                                                                         | Establecer URL base            |
| `withInterceptors(...interceptors)`                                                         | Registrar interceptores        |
| `defineRequest({ method, path, input?, build?, output? })`                                  | Definir un endpoint HTTP       |
| `defineEventStream({ path, events, input?, build? })`                                       | Definir un endpoint SSE        |
| `defineWebSocket({ path, incoming, outgoing?, input?, build? })`                            | Definir un endpoint WebSocket  |
| `struct.object(shape)`                                                                      | Esquema de objeto              |
| `struct.string()` / `struct.number()` / `struct.boolean()`                                  | Esquemas primitivos            |
| `struct.array(item)`                                                                        | Esquema de matriz              |
| `struct.enum(values)`                                                                       | Esquema de enumeración         |
| `struct.alias(name)                                                                         | Alias de campo                 |
| `createHttpInterceptor(fn)` / `createSSEInterceptor(fn)` / `createWebSocketInterceptor(fn)` | Crear interceptores            |
| `basicAuthHttpInterceptor(fn)` / `basicAuthSSEInterceptor(fn)`                              | Basic Auth integrado           |

## Qué sigue

- [Cliente →](/core/client) — Creación de cliente y uso de `execute`
- [Comandos →](/core/commands) — Definiciones de comandos y reglas de entrada opcional
- [Interceptores →](/core/interceptors) — Tipos de interceptor y mecánica de cadena de cebolla
