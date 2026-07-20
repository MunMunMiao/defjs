---
title: Examples
description: Complete, runnable code snippets covering REST CRUD, SSE, WebSocket, interceptor patterns, and Vue integration.
---

# 예제

이 페이지에서는 가장 일반적인 사용 사례에 대해 복사해서 바로 쓸 수 있는 예제를 제공해요.

## REST CRUD

### 스키마와 엔드포인트 정의

```typescript
import { createClient, defineRequest, struct, withEndpoint, RequestError } from '@defjs/core'

// 데이터 모델
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

// 요청 정의
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

### 실행

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

### 오류 처리

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

## SSE 실시간 알림

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

## WebSocket 채팅방

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

## 인터셉터 구성

### 인증

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

### 로깅

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

## Vue 통합

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

## API 치트시트

| Export                                                                                      | 일반적인 사용법           |
| ------------------------------------------------------------------------------------------- | ------------------------- |
| `createClient(...options)`                                                                  | 클라이언트 인스턴스 생성  |
| `withEndpoint(url)`                                                                         | 기본 URL 설정             |
| `withInterceptors(...interceptors)`                                                         | 인터셉터 등록             |
| `defineRequest({ method, path, input?, build?, output? })`                                  | HTTP 엔드포인트 정의      |
| `defineEventStream({ path, events, input?, build? })`                                       | SSE 엔드포인트 정의       |
| `defineWebSocket({ path, incoming, outgoing?, input?, build? })`                            | WebSocket 엔드포인트 정의 |
| `struct.object(shape)`                                                                      | 객체 스키마               |
| `struct.string()` / `struct.number()` / `struct.boolean()`                                  | 기본 스키마               |
| `struct.array(item)`                                                                        | 배열 스키마               |
| `struct.enum(values)`                                                                       | 열거형 스키마             |
| `struct.alias(name)                                                                         | 필드 별칭                 |
| `createHttpInterceptor(fn)` / `createSSEInterceptor(fn)` / `createWebSocketInterceptor(fn)` | 인터셉터 생성             |
| `basicAuthHttpInterceptor(fn)` / `basicAuthSSEInterceptor(fn)`                              | 내장 Basic Auth           |

## 다음 단계

- [클라이언트 →](/core/client) — 클라이언트 생성과 `execute` 사용법
- [커맨드 →](/core/commands) — 커맨드 정의와 입력 선택 규칙
- [인터셉터 →](/core/interceptors) — 인터셉터 타입과 어니언 체인 메커니즘
