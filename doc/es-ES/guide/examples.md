---
title: Ejemplos
description: Recetas adaptables para aplicaciones REST, SSE, WebSocket, autenticación, Vue y React.
---

# Ejemplos

Utiliza estas recetas como punto de partida para tu aplicación. Sustituye rutas de endpoints, Structs, credenciales, actualizaciones de estado y nombres de telemetría por el contrato y las políticas reales de tu servicio.

Cada receta es un módulo completo o un fragmento de archivo. Los ejemplos de red esperan que tu servidor implemente el contrato mostrado. Tu aplicación controla endpoints, credenciales, estado de interfaz, logging, cancelación y liberación de transportes.

## Módulo CRUD REST

Este módulo declara su dependencia de Core, proyecta cada cuerpo mediante un Struct de cuerpo, gestiona los errores de las tuplas y acepta una señal de cancelación proporcionada por quien controla la operación.

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

Lanzar el error desde estas funciones exportadas es una decisión de integración de la aplicación. La ejecución de Core sigue devolviendo tuplas.

## Consumidor de notificaciones SSE

Esta función limita los reintentos y el buffer, estrecha por nombre la unión de eventos decodificados mediante Structs y cierra el stream que abre.

```typescript
// consume-notifications.ts
import {
  createClient,
  defineEventStream,
  struct,
  type Infer,
  withEndpoint,
  withSSEOnInvalidEvent,
  withSSEQueue,
  withSSEReconnect,
} from '@defjs/core'

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
  path: '/notifications',
  events: {
    message: struct.json(notificationStruct),
  },
})

export async function consumeNotifications(signal: AbortSignal, handlers: NotificationHandlers): Promise<void> {
  const client = createClient(
    withEndpoint('https://api.example.com'),
    withSSEReconnect({ attempts: 5, delayMs: 1_000, maxDelayMs: 10_000 }),
    withSSEQueue({ maxSize: 100, overflow: 'drop-oldest' }),
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

Los handlers deben ser rápidos y no lanzar excepciones. Esta receta no registra datos ni IDs de evento sin procesar, ni tampoco URLs.

## Consumidor de una sala WebSocket

La reconexión es explícita. La función consume la cola de entrada sin límite durante toda la sesión lógica, limita la cola de salida y cierra el recurso en todas las rutas de salida.

```typescript
// consume-room.ts
import {
  createClient,
  defineWebSocket,
  struct,
  withEndpoint,
  withWebSocketHeartbeat,
  withWebSocketQueue,
  withWebSocketReconnect,
} from '@defjs/core'

interface RoomHandlers {
  onMessage(message: { text: string; userId: number }): void
  onRuntimeError(): void
}

const room = defineWebSocket({
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
    withWebSocketQueue({ maxSize: 20, overflow: 'drop-oldest' }),
  )

  const encodedRoomId = encodeURIComponent(roomId)
  const [error, session] = await client.execute(room({ path: { roomId: encodedRoomId } }), { signal })

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

La ruta del endpoint no codifica los placeholders, por lo que esta receta codifica un único segmento antes de crear el comando. No registra la URL resultante ni los payloads.

## Autenticación y métricas de operación

Esta función de creación combina autenticación HTTP y SSE con métricas de duración HTTP que usan un conjunto limitado de campos. El nombre de la operación procede de un token explícito de `HttpContext`, no de una URL.

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

Utiliza el contexto al ejecutar:

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

La aplicación controla el proveedor de credenciales. En servidor, mantenlo dentro del ámbito de la petición. La autenticación WebSocket del navegador requiere un diseño independiente revisado para el despliegue, porque los sockets nativos del navegador no pueden añadir esta cabecera.

## Composición con Vue

La aplicación instala un cliente de navegador. El componente observa su prop y cancela el trabajo HTTP que haya quedado obsoleto.

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

## Composición con React

El provider establece el ámbito del cliente. El componente controla la cancelación de su efecto.

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

Desmontar el provider no cancela el trabajo por sí mismo. Cada componente sigue siendo responsable de la petición, el stream o la sesión que inicie.

## Siguiente paso

- [Comandos](/es-ES/core/commands) explica las definiciones empleadas en estas recetas.
- [Interceptores](/es-ES/core/interceptors) es la referencia para las políticas de reintento y autenticación.
- [Vue](/es-ES/plugins/vue) y [React](/es-ES/plugins/react) cubren el ámbito y los límites SSR propios de cada adaptador.
