---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# Loslegen

Defjs ist eine TypeScript-Bibliothek zum Definieren typisierter Request-APIs und zum Ausführen über mehrere Transports und JavaScript-Laufzeiten.

## Installation

Verwende deinen bevorzugten Paketmanager:

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## CDN-Nutzung

Importiere direkt als ES-Module ohne Build-Tool:

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## Drei Schritte zu deiner ersten Anfrage

### Schritt 1: Client erstellen

Der Client ist der Einstiegspunkt für alle Request-Ausführungen. Erstelle eine Instanz mit `createClient` und konfiguriere den Basis-Endpunkt:

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### Schritt 2: Anfrage definieren

Verwende `defineRequest`, um einen typisierten HTTP-Endpunkt zu definieren. Verwende `struct`, um die Form von Inputs und Responses zu beschreiben:

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
Die Schlüssel in `output` sind HTTP-Statuscodes. Defjs wählt automatisch das passende Struct zur Laufzeit und leitet die TypeScript-Typen dementsprechend ab: 2xx-Responses werden als Success-Daten typisiert, Nicht-2xx als Fehlerdaten.
:::

### Schritt 3: Ausführen

Rufe `client.execute` mit deinem Request-Command und optionaler Konfiguration auf:

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error ist typisiert basierend auf den non-2xx-Structs in output
  console.error(error.code, error.message)
  return
}

// user ist typisiert als { id: number; name: string }
console.log(user.name)
```

## Komplettes Beispiel

Hier ist ein End-to-End-Beispiel mit Input-Validierung, Output-Validierung, Fehlerbehandlung und einem Interceptor:

```typescript
import { createClient, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

// 1. Client erstellen
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. Anfrage definieren
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': struct.string(),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. Ausführen
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## Core-API-Kurzreferenz

| API                    | Beschreibung                        | Typische Nutzung                                                               |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | Client erstellen                    | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | HTTP-Endpunkt definieren            | `defineRequest({ method: 'GET', path: '/user', output: { 200: UserStruct } })` |
| `defineEventStream`    | SSE-Endpunkt definieren             | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | WebSocket-Endpunkt definieren       | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | Struct-Builder                      | `struct.object({ id: struct.number() })`                                       |
| `.alias(name)`         | Wire-Name-Alias für Felder          | `struct.string().alias('user_name')`                                           |
| `withEndpoint`         | Basis-URL setzen                    | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | Interceptors registrieren           | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | Cross-Origin-Credentials aktivieren | `withCredentials(true)`                                                        |
| `withSSEOptions`       | SSE-Optionen konfigurieren          | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | WebSocket-Optionen konfigurieren    | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## Wie geht es weiter

- [Client →](/core/client) — Clients erstellen, Commands ausführen und konfigurieren
- [Commands →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [Errors →](/core/errors) — `RequestError`-Struktur und Branching-Patterns
