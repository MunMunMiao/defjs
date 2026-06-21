---
title: Design-Entscheidungen
description: API-Design-Entscheidungen, die sich von gängigen Mustern in anderen HTTP-Bibliotheken unterscheiden können.
---

# Design-Entscheidungen

Defjs weicht absichtlich von einigen gängigen Mustern ab, die in anderen HTTP-Bibliotheken zu finden sind. Dieses Dokument erklärt die Design-Grundlage hinter jeder Entscheidung.

## Explizites Client-Design

Defjs erfordert, dass jeder Client explizit erstellt wird. Du erstellst einen `Client` mit `createClient` und übergibst ihn dort, wo er benötigt wird.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

Warum dieses Design:

- **Testfreundlich**: Übergib einfach verschiedene `Client`-Instanzen direkt an Tests, ohne Zustand zurücksetzen oder mocken zu müssen.
- **Multi-Environment-Koexistenz**: Mehrere Clients können parallel im selben Prozess laufen (z. B. interne API + öffentliche API) ohne Interferenz.
- **Abhängigkeitstransparenz**: Aufrufer müssen explizit einen `Client` halten, was Abhängigkeiten für statische Analyse und Code-Review sichtbar macht.

Falls du einen gemeinsamen Client in deiner Anwendung brauchst, exportiere ihn aus einem Modul:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## Framework-Integration

`@defjs/angular`, `@defjs/vue` und `@defjs/react` integrieren explizite Clients in das Abhängigkeitsmodell des jeweiligen Frameworks. Angular und Vue nutzen `provideClient` / `injectClient`; React nutzt `ClientProvider` / `useClient`. Dadurch können Clients innerhalb der Komponenten- oder Service-Hierarchie registriert und abgerufen werden.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // client.execute(...) in der Komponentenlogik verwenden
}
```

## Request-Level-Optionen in `execute`, nicht im Builder

Request-Level-Optionen (`abort`, `timeout`, `heartbeat`, `reconnect`, etc.) werden über das zweite Argument von `client.execute` übergeben, nicht über den Command-Builder.

```typescript
// Correct: request-level options go to execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## Überladenes `execute` nach Command-Typ

`client.execute` ist überladen, um automatisch den korrekten Rückgabetyp basierend auf dem `Command`-Typ zurückzugeben.

```typescript
// HTTP-Request — gibt HttpAwaitResult zurück
const [error, user, response] = await client.execute(httpCommand())

// SSE-Stream — gibt StreamAwaitResult zurück
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — gibt SocketAwaitResult zurück
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` ist ein Observer

SSEs `onInvalidEvent` ist ein Observer. Darin geworfene Exceptions werden stillschweigend ignoriert und unterbrechen den Stream nicht.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // Even if this throws, the stream continues
    },
  },
})
```

## Error-Submodule-Konsolidierung

Alle Error-Symbole werden vom Haupt-Entry `@defjs/core` exportiert.

| Export                  | Beschreibung                | Typische Nutzung                                            |
| ----------------------- | --------------------------- | ----------------------------------------------------------- |
| `RequestError`          | Error-Union-Typ             | `switch (error.kind)` Branching                             |
| `ERR_ABORTED`           | Abort-Identifikator         | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | Timeout-Identifikator       | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | Transport-Error erstellen   | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | Definition-Error erstellen  | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | HTTP-Status-Error erstellen | `createHttpStatusError(404, 'Not Found', response, data)`   |

Import vom Haupt-Entry:

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## Error-Branching nach `kind` und `code`

Defjs empfiehlt Branching nach `kind` und `code` statt String-Vergleichen.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## Strengere Endpoint-Definition-Regeln

Defjs erzwingt eine strenge Regel: **Wenn `build` angegeben ist, muss auch `input` angegeben werden.**

```typescript
// Correct: has input and build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// Correct: no input and no build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// Error: has build but no input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript error: missing input struct
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

Diese Regel gilt auch für `defineEventStream` und `defineWebSocket`.

## Abhängigkeiten

| Paket            | Erforderliche Version |
| ---------------- | --------------------- |
| `@defjs/core`    | `^0.4.0`              |
| `@defjs/angular` | `19.x`                |
| `@defjs/vue`     | `^0.4.0`              |
| `@defjs/react`   | `^0.4.0`              |

Angular-Peer-Dependency-Range: `>=18.0.0 <=22.0.0`. React-Peer-Dependency-Range: `>=18.0.0`. Node-Laufzeit: `>=26`.

## Wie geht es weiter

- [Client →](/core/client) — Explizites Client-Design und Konfiguration
- [Commands →](/core/commands) — Command-Definitionen und Input-Regeln
- [Errors →](/core/errors) — `RequestError`-Struktur und Branching
