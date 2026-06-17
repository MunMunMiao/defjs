---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# Client

`@defjs/core` verwendet ein **explizites Client-Design**. Jede Anfrage wird über eine von dir explizit erstellte `Client`-Instanz ausgeführt. Das macht Testing, Multi-Environment-Konfiguration und Abhängigkeitsverfolgung unkompliziert.

## Client erstellen

Verwende `createClient` mit einer oder mehreren Konfigurationsfunktionen.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Konfigurationsfunktionen komponieren. Spätere Funktionen überschreiben frühere für denselben Schlüssel.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### Konfigurationsoptionen

| Funktion                            | Beschreibung                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `withEndpoint(url)`                 | Basis-API-Adresse.                                                           |
| `withHTTPHandle(fetch)`             | Eigene `fetch`-Implementierung für HTTP.                                     |
| `withSSEHandle(fetch)`              | Eigene `fetch`-Implementierung für SSE.                                      |
| `withWebSocketHandle(WebSocket)`    | Eigener `WebSocket`-Konstruktor (z. B. für Node).                            |
| `withInterceptors(...interceptors)` | Transport-Layer-Interceptors registrieren. Automatisch nach `kind` verteilt. |
| `withQueryParamsSerializer(fn)`     | Eigene Query-Parameter-Serialisierung.                                       |
| `withCredentials(boolean)`          | Ob Cross-Origin-Credentials mitgesendet werden.                              |
| `withXSRF(options)`                 | XSRF-Token-Lese- und Injektionsverhalten.                                    |
| `withSSEOptions(options)`           | SSE-Wiederverbindung, Warteschlange, Invalid-Event-Handling etc.             |
| `withWebSocketOptions(options)`     | WebSocket-Heartbeat, Wiederverbindung, Warteschlange, Subprotokolle etc.     |

Für SSE- und WebSocket-spezifische Konfiguration siehe [SSE](/core/sse) und [WebSocket](/core/web-socket).

## Commands ausführen

`Client.execute` ist eine überladene Methode, die basierend auf dem `Command`-Typ an die korrekte Transport-Layer verteilt.

### HTTP-Requests

Übergib einen Command, der mit `defineRequest` gebaut wurde. Gibt ein Triplet zurück:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

Rückgabetyp:

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE-Event-Streams

Übergib einen Command, der mit `defineEventStream` gebaut wurde. Gibt einen Stream-Handle und Open-Info zurück.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

Rückgabetyp:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket-Verbindungen

Übergib einen Command, der mit `defineWebSocket` gebaut wurde. Gibt ein Session-Objekt zurück.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

Rückgabetyp:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## Hilfsfunktionen

### `isClient`

Prüft, ob ein Wert eine gültige `Client`-Instanz ist.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

Extrahiert das interne Konfigurationsobjekt zum Debuggen oder zum Bauen höherer Abstraktionen.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

Falls der Wert keine `Client`-Instanz ist, wirft `getClientConfig` einen `TypeError`.

## Explizites Client-Design

Jeder Client in Defjs wird explizit erstellt. Du erstellst einen `Client` mit `createClient` und übergibst ihn dort, wo er gebraucht wird.

Vorteile expliziter Erstellung:

- **Testfreundlich**: Übergib verschiedene `Client`-Instanzen direkt an Tests, ohne irgendeinen Zustand zurücksetzen oder mocken zu müssen.
- **Multi-Environment-Koexistenz**: Mehrere Clients können parallel im selben Prozess laufen (z. B. interne API + öffentliche API).
- **Abhängigkeitstransparenz**: Aufrufer müssen explizit einen `Client` halten, was Abhängigkeiten für statische Analyse und Code-Review sichtbar macht.

Falls du einen gemeinsamen Client in deiner Anwendung brauchst, exportiere ihn aus einem Modul:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Dann importieren und verwenden in Business-Code:

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## Wie geht es weiter

- [HTTP Requests →](/core/http) — `defineRequest` und Output-Patterns
- [SSE →](/core/sse) — SSE-Definition, Wiederverbindung und Event-Warteschlangen
- [WebSocket →](/core/web-socket) — WebSocket-Definition, Heartbeat und Wiederverbindungsstrategien
- [Interceptors →](/core/interceptors) — Interceptor-Typen und Zwiebelketten-Mechanik
