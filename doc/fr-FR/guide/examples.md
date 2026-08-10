---
title: Exemples
description: Recettes adaptables pour les applications REST, SSE, WebSocket, authentification, Vue et React.
---

# Exemples

Utilisez ces recettes comme point de départ dans votre application. Remplacez les chemins d'endpoint, Structs, identifiants, mises à jour d'état et noms de télémétrie par le contrat et les règles réels de votre service.

Chaque recette forme un module complet ou un fragment de fichier. Les exemples réseau supposent que votre serveur implémente le contrat présenté. Votre application gère les endpoints, identifiants, états de l'interface, logs, annulations et ressources de transport.

## Module CRUD REST

Ce module déclare sa dépendance Core, enveloppe chaque `body` dans une Struct adaptée, gère les erreurs du tuple et accepte le signal d'annulation fourni par son propriétaire.

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

Ces fonctions exportées choisissent de lever les erreurs à leur frontière d'intégration. L'exécution Core, elle, continue de renvoyer des tuples.

## Consommer des notifications SSE

Cette fonction borne les nouvelles tentatives et la file, réduit l'union des événements décodés par les Structs en fonction du nom d'événement, puis ferme le flux qu'elle ouvre.

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

Les handlers doivent rester rapides et ne pas lever d'exception. Cette recette ne journalise ni données brutes d'événement, ni ID, ni URL.

## Consommer un salon WebSocket

La reconnexion est explicite. L’endpoint fixe des capacités entrante et sortante bornées, un seul itérateur consomme la session logique et chaque chemin de sortie la ferme.

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

Transmettez les valeurs des paramètres brutes. Core encode chaque valeur exactement une fois lors de son insertion dans le `path` ; ne les préencodez pas, sinon `%` sera encodé de nouveau. Cette recette ne journalise ni l'URL produite ni les payloads.

## Authentification et métriques d'opération

Cette fabrique compose l'authentification HTTP et SSE avec une mesure HTTP aux champs bornés. Le nom d'opération provient d'un token `HttpContext` explicite, jamais de l'URL.

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

Utilisez le contexte lors de l'exécution :

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

Le fournisseur d'identifiants appartient à l'application. Côté serveur, gardez-le dans la portée de la requête. L'authentification WebSocket dans un navigateur exige un mécanisme distinct, validé pour le déploiement, car les sockets natifs ne peuvent pas ajouter cet en-tête.

## Composition Vue

L'application installe un client pour le navigateur. Le composant observe sa prop et annule la requête HTTP devenue obsolète.

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

## Composition React

Le provider définit la portée du client. Le composant gère l'annulation de son effet.

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

Le démontage du provider n'annule aucun travail à lui seul. Chaque composant reste responsable de la requête, du flux ou de la session qu'il démarre.

## Étapes suivantes

- [Commandes](/fr-FR/core/commands) explique les définitions utilisées dans ces recettes.
- [Intercepteurs](/fr-FR/core/interceptors) détaille les politiques de relance et d'authentification.
- [Vue](/fr-FR/plugins/vue) et [React](/fr-FR/plugins/react) couvrent la portée et les frontières SSR propres aux adaptateurs.
