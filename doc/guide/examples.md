---
title: Examples
description: Complete, runnable code snippets covering REST CRUD, SSE, WebSocket, interceptor patterns, and Vue integration.
---

# Examples

This page provides examples for the most common use cases.

> These examples target the current repository source/workspace API. If you installed the current npm latest or a CDN build from the published release line, check that release's README or release notes before copying `withEndpoint(...)`, `struct.request(...)`, or related helpers into an external app.

## REST CRUD

The examples in this guide use the array form because it keeps status/body pairs explicit and supports grouping multiple statuses. Object-form `output` is still supported and remains useful for compact reference examples.

### Define Structs and Endpoints

```typescript
import { createClient, defineRequest, struct, withEndpoint, RequestError } from '@defjs/core'

// Data models
const UserStruct = struct.object({
  id: struct.number(),
  name: struct.string(),
  email: struct.string(),
})

const UserListStruct = struct.object({
  items: struct.array(UserStruct),
  total: struct.number(),
})

// Request definitions
const createUser = defineRequest({
  method: 'POST',
  path: '/v1/users',
  input: struct.request({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
      role: struct.string(),
    }),
  }),
  output: [
    { status: 201, body: UserStruct },
    { status: 400, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const listUsers = defineRequest({
  method: 'GET',
  path: '/v1/users',
  output: [{ status: 200, body: UserListStruct }] as const,
})

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    { status: 200, body: UserStruct },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const updateUser = defineRequest({
  method: 'PUT',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  output: [
    { status: 200, body: UserStruct },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const deleteUser = defineRequest({
  method: 'DELETE',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    { status: 204, body: struct.unknown() },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

### Execute

```typescript
const client = createClient(withEndpoint('https://api.example.com'))

async function handleCreate() {
  const [error, user] = await client.execute(
    createUser({
      body: { name: 'Alice', email: 'alice@example.com', role: 'admin' },
    }),
  )
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
  const [error, user] = await client.execute(getUser({ path: { id } }))
  if (error) {
    handleError(error)
    return
  }
  console.log('User:', user.name)
}

async function handleUpdate(id: number) {
  const [error, user] = await client.execute(
    updateUser({
      path: { id },
      body: { name: 'Bob', email: 'bob@example.com' },
    }),
  )
  if (error) {
    handleError(error)
    return
  }
  console.log('Updated:', user)
}

async function handleDelete(id: number) {
  const [error] = await client.execute(deleteUser({ path: { id } }))
  if (error) {
    handleError(error)
    return
  }
  console.log('Deleted')
}
```

### Error Handling

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

## SSE Real-Time Notifications

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
    message: struct.json(
      struct.object({
        id: struct.string(),
        content: struct.string(),
        timestamp: struct.number(),
      }),
    ),
    alert: struct.json(
      struct.object({
        level: struct.enum(['info', 'warning', 'critical'] as const),
        title: struct.string(),
      }),
    ),
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

## WebSocket Chat Room

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
  input: struct.request({
    path: struct.object({
      roomId: struct.string(),
    }),
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
    pong: struct.object({}),
  },
  outgoing: {
    sendMessage: struct.object({
      text: struct.string(),
    }),
    ping: struct.object({}),
  },
})

async function joinChat(roomId: string) {
  const [error, session, connection] = await client.execute(chatRoom({ path: { roomId } }))

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

  session.send({ type: 'sendMessage', text: 'Hello everyone!' })

  for await (const msg of session.receive) {
    switch (msg.type) {
      case 'message':
        console.log(`${msg.userId}: ${msg.text}`)
        break
      case 'userJoined':
        console.log(`${msg.userName} joined`)
        break
      case 'userLeft':
        console.log(`${msg.userId} left`)
        break
    }
  }

  const closeInfo = await session.closed
  console.log('Closed:', closeInfo.code, closeInfo.reason)
}
```

## Interceptor Composition

### Authentication

```typescript
import {
  createClient,
  createHttpInterceptor,
  createSSEInterceptor,
  createWebSocketInterceptor,
  type HttpRequest,
  withInterceptors,
  withEndpoint,
} from '@defjs/core'

function authInterceptors(getToken: () => string | null) {
  const apply = (req: HttpRequest) => {
    const token = getToken()
    if (!token) return req
    const headers = new Headers(req.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return { ...req, headers }
  }

  return {
    http: createHttpInterceptor((req, next) => next(apply(req))),
    sse: createSSEInterceptor((req, next) => next(apply(req))),
    webSocket: createWebSocketInterceptor((req, next) => next(apply(req))),
  }
}

const auth = authInterceptors(() => localStorage.getItem('token'))

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(auth.http, auth.sse, auth.webSocket))
```

### Logging

```typescript
function requestTarget(req: HttpRequest) {
  const query = typeof req.queryString === 'string' && req.queryString.length > 0 ? `?${req.queryString}` : ''
  return `${req.baseEndpoint ?? ''}${req.endpoint}${query}`
}

function loggingInterceptor() {
  return createHttpInterceptor(async (req, next) => {
    const start = performance.now()
    const target = requestTarget(req)
    console.log(`[HTTP] ${req.method} ${target}`)

    try {
      const response = await next(req)
      const duration = (performance.now() - start).toFixed(2)
      console.log(`[HTTP] ${req.method} ${target} — ${response.status} (${duration}ms)`)
      return response
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2)
      console.error(`[HTTP] ${req.method} ${target} — ERROR (${duration}ms)`, error)
      throw error
    }
  })
}
```

## Vue Integration

```typescript
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { authInterceptor } from './interceptors'

const app = createApp(App)

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor()),
  ),
)

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
  output: [{ status: 200, body: struct.object({ name: struct.string() }) }] as const,
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

## API Cheat Sheet

| Export                                                                                      | Typical Usage               |
| ------------------------------------------------------------------------------------------- | --------------------------- |
| `createClient(...options)`                                                                  | Create a client instance    |
| `withEndpoint(url)`                                                                         | Set base URL                |
| `withInterceptors(...interceptors)`                                                         | Register interceptors       |
| `defineRequest({ method, path, input?, build?, output? })`                                  | Define an HTTP endpoint     |
| `defineEventStream({ path, events, input?, build? })`                                       | Define an SSE endpoint      |
| `defineWebSocket({ path, incoming, outgoing?, input?, build? })`                            | Define a WebSocket endpoint |
| `struct.object(shape)`                                                                      | Object struct               |
| `struct.request({ path, query, headers, body })`                                            | Request-shaped input        |
| `struct.string()` / `struct.number()` / `struct.boolean()`                                  | Primitive structs           |
| `struct.array(item)`                                                                        | Array struct                |
| `struct.enum(values)`                                                                       | Enum struct                 |
| `.alias(name)`                                                                              | Field-level wire-name alias |
| `createHttpInterceptor(fn)` / `createSSEInterceptor(fn)` / `createWebSocketInterceptor(fn)` | Create interceptors         |
| `basicAuthHttpInterceptor(fn)` / `basicAuthSSEInterceptor(fn)`                              | Built-in Basic Auth         |

## What's Next

- [Client →](/core/client) — Client creation and `execute` usage
- [Commands →](/core/commands) — Command definitions and input optional rules
- [Interceptors →](/core/interceptors) — Interceptor types and onion-chain mechanics
