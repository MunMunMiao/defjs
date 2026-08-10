---
title: 예제
description: REST, SSE, WebSocket, 인증, Vue, React 애플리케이션에 적용할 수 있는 레시피입니다.
---

# 예제

이 레시피를 애플리케이션의 시작점으로 사용하세요. 엔드포인트 경로, Struct, credential, 상태 업데이트, telemetry 이름을 실제 서비스 계약과 정책에 맞게 바꾸세요.

각 레시피는 완전한 모듈 또는 파일 조각입니다. 네트워크 예제는 서버가 표시된 계약을 구현한다고 가정합니다. endpoint, credential, UI 상태, logging, 취소, 트랜스포트 정리는 애플리케이션이 관리합니다.

## REST CRUD 모듈

이 모듈은 core 의존성을 선언하고 모든 body를 body Struct로 매핑하며 튜플 실패를 처리하고 소유자가 전달한 취소 signal을 받습니다.

```typescript
// users-api.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  email: struct.string(),
})

const ApiError = struct.object({
  code: struct.string(),
  message: struct.string(),
})

const client = createClient(withEndpoint('https://api.example.com/v1'))

const createUserRequest = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: [
    { status: 201, body: User },
    { status: [400, 409], body: ApiError },
  ] as const,
})

export const listUsersRequest = defineRequest({
  method: 'GET',
  path: '/users',
  input: struct.request({
    query: struct.object({
      cursor: struct.string().optional(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        items: struct.array(User),
        nextCursor: struct.string().optional().alias('next_cursor'),
      }),
    },
  ] as const,
})

export const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: ApiError },
  ] as const,
})

const updateUserRequest = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: ApiError },
  ] as const,
})

const deleteUserRequest = defineRequest({
  method: 'DELETE',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 204, body: struct.unknown() },
    { status: 404, body: ApiError },
  ] as const,
})

export async function createUser(input: { name: string; email: string }, signal: AbortSignal) {
  const [error, user] = await client.execute(createUserRequest({ body: input }), { signal })

  if (error) {
    throw error
  }
  return user
}

export async function listUsers(cursor: string | undefined, signal: AbortSignal) {
  const [error, page] = await client.execute(listUsersRequest({ query: { cursor } }), { signal })

  if (error) {
    throw error
  }
  return page
}

export async function updateUser(id: number, input: { name: string; email: string }, signal: AbortSignal) {
  const [error, user] = await client.execute(updateUserRequest({ path: { id }, body: input }), { signal })

  if (error) {
    throw error
  }
  return user
}

export async function deleteUser(id: number, signal: AbortSignal): Promise<void> {
  const [error] = await client.execute(deleteUserRequest({ path: { id } }), { signal })

  if (error) {
    throw error
  }
}
```

export된 함수에서 throw하는 것은 애플리케이션 통합상의 선택입니다. Core 실행 자체는 계속 튜플을 반환합니다.

## SSE notification consumer

이 함수는 재시도 횟수와 buffer 크기를 제한하고, Struct로 디코딩된 event union을 event 이름을 기준으로 좁히며, 자신이 연 스트림을 닫습니다.

```typescript
// consume-notifications.ts
import { createClient, defineEventStream, struct, type Infer, withEndpoint, withSSEOnInvalidEvent, withSSEReconnect } from '@defjs/core'

const notificationStruct = struct.object({
  id: struct.number(),
  text: struct.string(),
})
type Notification = Infer<typeof notificationStruct>

interface NotificationHandlers {
  onInvalid(event: { eventName: string; reason: string }): void
  onMessage(notification: Notification): void
}

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(notificationStruct),
  },
})

export async function consumeNotifications(signal: AbortSignal, handlers: NotificationHandlers): Promise<void> {
  const client = createClient(
    withEndpoint('https://api.example.com'),
    withSSEReconnect({ attempts: 5, delayMs: 1_000, maxDelayMs: 10_000 }),
    withSSEOnInvalidEvent(({ reason, message }) => {
      handlers.onInvalid({ eventName: message.event, reason })
    }),
  )

  const [error, stream] = await client.execute(notifications(), { signal })
  if (error) {
    throw error
  }

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          handlers.onMessage(event.data)
          break
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

handler는 빠르고 throw하지 않게 작성해야 합니다. 이 레시피는 원본 이벤트 데이터, ID 또는 URL을 기록하지 않습니다.

## WebSocket room consumer

재연결을 명시적으로 활성화합니다. endpoint가 incoming/outgoing 용량을 제한하고 하나의 iterator가 논리 세션을 소비하며 모든 종료 경로에서 세션을 닫습니다.

```typescript
// consume-room.ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketHeartbeat, withWebSocketReconnect } from '@defjs/core'

interface RoomHandlers {
  onMessage(message: { text: string; userId: number }): void
  onRuntimeError(): void
}

const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
  path: '/rooms/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  incoming: {
    message: struct.object({ text: struct.string(), userId: struct.number() }),
    pong: struct.object({}),
  },
  outgoing: {
    join: struct.object({}),
    ping: struct.object({}),
  },
})

export async function consumeRoom(roomId: string, signal: AbortSignal, handlers: RoomHandlers): Promise<void> {
  const client = createClient(
    withEndpoint('wss://chat.example.com'),
    withWebSocketReconnect({
      attempts: 5,
      shouldReconnect: ({ wasClean }) => !wasClean,
    }),
    withWebSocketHeartbeat({
      intervalMs: 30_000,
      timeoutMs: 10_000,
      message: () => ({ type: 'ping' }),
      isAck: (message) => typeof message === 'object' && message !== null && 'type' in message && message.type === 'pong',
    }),
  )

  const [error, session] = await client.execute(room({ path: { roomId } }), { signal })

  if (error) {
    throw error
  }

  const unsubscribeError = session.onRuntimeError(() => {
    handlers.onRuntimeError()
  })

  try {
    session.send({ type: 'join' })

    for await (const message of session.receive) {
      if (message.type === 'message') {
        handlers.onMessage({ text: message.text, userId: message.userId })
      }
    }
  } finally {
    unsubscribeError()
    session.close(1000, 'consumer-finished')
    await session.closed
  }
}
```

placeholder 값은 원본 그대로 전달합니다. Core는 path에 치환할 때 각 값을 정확히 한 번 인코딩합니다. `%`가 다시 인코딩되므로 미리 인코딩하지 마세요. 이 레시피는 결과 URL이나 payload를 로그에 남기지 않습니다.

## 인증과 operation metric

이 factory는 HTTP·SSE 인증과 제한된 HTTP timing 필드를 조합합니다. operation 이름은 URL이 아니라 명시적인 `HttpContext` token에서 가져옵니다.

```typescript
// observed-client.ts
import {
  createClient,
  createHttpInterceptor,
  createSSEInterceptor,
  makeHttpContext,
  makeHttpContextToken,
  withEndpoint,
  withInterceptors,
} from '@defjs/core'
import type { HttpRequest } from '@defjs/core'

export type Operation = 'create-user' | 'delete-user' | 'list-users' | 'update-user'

interface MetricRecorder {
  record(value: { durationMs: number; operation: Operation | 'unknown'; status: number }): void
}

const operationToken = makeHttpContextToken<Operation | 'unknown'>(() => 'unknown')

function addBearerToken(request: HttpRequest, token: string) {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...request, headers }
}

export function contextFor(operation: Operation) {
  return makeHttpContext().set(operationToken, operation)
}

export function createObservedClient(getToken: () => string | null, metrics: MetricRecorder) {
  const httpAuth = createHttpInterceptor((request, next) => {
    const token = getToken()
    return next(token ? addBearerToken(request, token) : request)
  })

  const sseAuth = createSSEInterceptor((request, next) => {
    const token = getToken()
    return next(token ? addBearerToken(request, token) : request)
  })

  const timing = createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    metrics.record({
      durationMs: Math.round(performance.now() - startedAt),
      operation: request.context?.get(operationToken) ?? 'unknown',
      status: response.status,
    })

    return response
  })

  return createClient(withEndpoint('https://api.example.com'), withInterceptors(timing, httpAuth, sseAuth))
}
```

실행할 때 context를 사용합니다.

```typescript
import { getAccessToken } from './auth'
import { listUsersRequest } from './users-api'
import { contextFor, createObservedClient } from './observed-client'
import { outboundMetrics } from './telemetry'

const client = createObservedClient(getAccessToken, outboundMetrics)
const [error, users] = await client.execute(listUsersRequest(), {
  context: contextFor('list-users'),
})

if (error) {
  throw error
}
```

credential provider는 애플리케이션이 소유합니다. 서버에서는 요청 범위로 유지하세요. native 브라우저 socket은 이 header를 추가할 수 없으므로 브라우저 WebSocket 인증에는 배포 환경에서 별도로 검토한 설계가 필요합니다.

## Vue 조합

애플리케이션은 브라우저 client 하나를 설치합니다. component는 prop을 watch하고 대체된 HTTP 작업을 취소합니다.

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

createApp(App)
  .use(provideClient(withEndpoint('https://api.example.com')))
  .mount('#app')
```

```vue
<!-- UserName.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { injectClient } from '@defjs/vue'
import { getUser } from './users-api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('')

watch(
  () => props.id,
  (id, _previous, onCleanup) => {
    const abort = new AbortController()
    onCleanup(() => abort.abort())

    void client.execute(getUser({ path: { id } }), { signal: abort.signal }).then(([error, user]) => {
      if (!abort.signal.aborted) {
        name.value = error ? '' : user.name
      }
    })
  },
  { immediate: true },
)
</script>

<template>
  <span>{{ name }}</span>
</template>
```

## React 조합

프로바이더가 클라이언트 범위를 정합니다. 컴포넌트가 effect 취소를 소유합니다.

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserName } from './UserName'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserName id={7} />
    </ClientProvider>
  )
}
```

```tsx
// UserName.tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './users-api'

export function UserName({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    const abort = new AbortController()

    void client.execute(getUser({ path: { id } }), { signal: abort.signal }).then(([error, user]) => {
      if (!abort.signal.aborted) {
        setName(error ? '' : user.name)
      }
    })

    return () => abort.abort()
  }, [client, id])

  return <span>{name}</span>
}
```

프로바이더 teardown만으로는 작업이 취소되지 않습니다. 각 컴포넌트가 자신이 시작한 요청, 스트림, 세션을 계속 소유합니다.

## 다음 단계

- [커맨드](/ko-KR/core/commands)에서는 이 레시피에서 사용한 정의를 설명합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 재시도와 인증 정책을 자세히 설명합니다.
- [Vue](/ko-KR/plugins/vue)와 [React](/ko-KR/plugins/react)에서는 adapter별 범위와 SSR 경계를 설명합니다.
