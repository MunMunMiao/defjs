---
title: Beispiele
description: Anpassbare Rezepte für REST-, SSE-, WebSocket-, Authentifizierungs-, Vue- und React-Anwendungen.
---

# Beispiele

Nutze diese Rezepte als Ausgangspunkt für deine Anwendung. Ersetze Endpunktpfade, Structs, Credentials, Zustandsänderungen und Telemetrienamen durch den Vertrag und die Richtlinien deines Dienstes.

Jedes Rezept ist ein vollständiges Modul oder Dateifragment. Netzwerkbeispiele erwarten einen Server mit dem gezeigten Vertrag. Deine Anwendung verwaltet Endpunktwerte, Credentials, UI-Zustand, Loggingrichtlinie, Abbruch und Transportbereinigung.

## REST-CRUD-Modul

Dieses Modul deklariert seine Core-Abhängigkeit, führt jeden Body durch ein Body-Struct, behandelt Tupelfehler und akzeptiert ein Abbruchsignal des Besitzers.

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

Dass diese exportierten Funktionen Fehler werfen, ist eine Entscheidung der Anwendungsintegration. Die Core-Ausführung selbst liefert weiterhin Tupel.

## SSE-Consumer für Benachrichtigungen

Diese Funktion begrenzt Retries und Pufferung, engt die per Struct dekodierte Event-Union anhand des Eventnamens ein und schließt den selbst geöffneten Stream.

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

Die Handler sollten schnell und frei von Exceptions sein. Dieses Rezept zeichnet weder rohe Eventdaten oder IDs noch URLs auf.

## WebSocket-Consumer für einen Raum

Reconnect ist explizit aktiviert. Der Endpunkt besitzt begrenzte Kapazitäten für eingehende und ausgehende Nachrichten, ein Iterator konsumiert die logische Session und jeder Ausgangspfad schließt sie.

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

Übergib Platzhalterwerte unverändert. Core kodiert jeden Wert beim Einsetzen in den Pfad genau einmal; kodiere ihn nicht vor, sonst wird `%` erneut kodiert. Dieses Rezept loggt weder die resultierende URL noch Payloads.

## Authentifizierung und Operationsmetriken

Diese Factory kombiniert HTTP- und SSE-Authentifizierung mit einer begrenzten Feldauswahl für HTTP-Zeitmessungen. Der Operationsname stammt aus einem ausdrücklichen `HttpContext`-Token statt aus einer URL.

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

Verwende den Context bei der Ausführung:

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

Der Credential-Provider gehört der Anwendung. Halte ihn auf dem Server Request-bezogen. Browser-WebSocket-Authentifizierung braucht ein eigenes, für das Deployment geprüftes Design, weil native Browser-Sockets diesen Header nicht setzen können.

## Vue-Komposition

Die Anwendung installiert einen Browser-Client. Die Komponente beobachtet ihr Prop und bricht überholte HTTP-Arbeit ab.

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

## React-Komposition

Der Provider legt den Client-Scope fest. Die Komponente verwaltet den Abbruch ihres Effects.

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

Das Entfernen eines Providers räumt Arbeit nicht von selbst auf. Jede Komponente bleibt für den Request, Stream oder die Session verantwortlich, die sie startet.

## Weiter

- [Commands](/de-DE/core/commands) erklärt die Definitionen aus diesen Rezepten.
- [Interceptors](/de-DE/core/interceptors) ist die Referenz für Retry- und Authentifizierungsrichtlinien.
- [Vue](/de-DE/plugins/vue) und [React](/de-DE/plugins/react) behandeln adapterspezifische Scopes und SSR-Grenzen.
