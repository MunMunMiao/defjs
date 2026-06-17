---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# Context

Defjs-Ausführungsablauf: Client-Konfiguration liefert globale Defaults; Command-Definitionen beschreiben die Endpoint-Struktur; `build` mapped geparsten Input auf HTTP-Request-Teile; und `HttpContext` fungiert als unsichtbares Gepäck, das zwischen Interceptors während eines einzelnen Ausführungszyklus weitergegeben wird.

## HttpContext-Passing

`HttpContext` ist ein Token-basierter Key-Value-Container für Metadaten innerhalb eines einzelnen Request/Connection-Lifecycle. Er nimmt nicht an URL-, Header- oder Body-Serialisierung teil. Er wird von Interceptors gelesen und geschrieben.

### Erstellen und Verwenden

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. Token definieren (mit Default-Wert)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. Context erstellen und Werte setzen
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. Zur Ausführungszeit übergeben
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### In Interceptors lesen

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### Contexts mergen

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged enthält sowohl requestId als auch auth
```

### Key API

| Export                                           | Beschreibung                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `makeHttpContextToken<T>(defaultValue: () => T)` | Token mit Default-Wert erstellen                                         |
| `makeHttpContext()`                              | Leeren Context erstellen                                                 |
| `makeHttpContext(entries)`                       | Aus `[token, value]`-Array erstellen                                     |
| `makeHttpContext(otherContext)`                  | Anderen Context kopieren                                                 |
| `mergeHttpContexts(primary, secondary)`          | Zwei Contexts mergen; secondary überschreibt primary für denselben Token |
| `ctx.set(token, value)`                          | Wert schreiben; gibt self zurück (chainable)                             |
| `ctx.get(token)`                                 | Wert lesen; gibt Token-Default zurück, falls nicht gesetzt               |
| `ctx.has(token) / ctx.del(token)`                | Prüfen / Löschen                                                         |
| `ctx.keys() / ctx.length`                        | Iterieren / Zählen                                                       |

---

## Request Builder und Input-Parsing

### Input-Parsing-Ablauf

Bei der Ausführung eines Commands verarbeitet der Client Input in dieser Reihenfolge:

1. **Validieren**: Validiert und parst Roh-Aufruferdaten mit dem `input`-Struct.
2. **Build**: Ruft `build(request, parsedInput)` auf, um geparste Daten auf Request-Teile zu mappen.
3. **Transport**: Verteilt an HTTP fetch, SSE stream oder WebSocket connection basierend auf `kind`.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Build-Handler-Fähigkeitsmatrix

Verschiedene Transports unterstützen verschiedene `build`-Operationen:

| Build-Methode                             | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

Die Verwendung einer nicht unterstützten Methode in `build` wirft `REQUEST_VALIDATION_FAILED` zur Ausführungszeit.

### Auto Build

Falls du `build` weglässt, musst du auch `input` weglassen. Du kannst jedoch Structs `request`-Shape verwenden, um das Framework die Build-Logik automatisch inferieren zu lassen:

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // Kein build nötig; Framework mapped Path/Query automatisch
})
```

Falls `build` angegeben ist, muss auch `input` angegeben werden. Das ist eine strikte Design-Regel.

---

## Client-Konfiguration

Erstelle einen Client mit `createClient` und einer oder mehreren Konfigurationsfunktionen. Spätere Funktionen überschreiben frühere für denselben Schlüssel.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### Core-Optionen

#### `withEndpoint(url)`

Setzt die Basis-API-Adresse. Alle Request-`path`-Werte werden an diese URL angehängt.

```typescript
withEndpoint('https://api.example.com/v1')
// Requesting /users produces https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

Ob Cross-Origin-Credentials (Cookies, HTTP-Auth-Headers, TLS-Client-Zertifikate) mitgesendet werden. Entspricht der `fetch`-Option `credentials`.

```typescript
withCredentials(true) // Cookies in Cross-Origin-Requests mitsenden
withCredentials(false) // Default
```

#### `withXSRF(options)`

Konfiguriert XSRF-Token-Lese- und Injektionsverhalten. Default ist Lesen von `XSRF-TOKEN` aus `document.cookie` und Injizieren in den `X-XSRF-TOKEN`-Header.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // Eigene Leselogik, z. B. aus localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| Feld            | Typ                                    | Default                     |
| --------------- | -------------------------------------- | --------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`              |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`            |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | Liest aus `document.cookie` |

#### `withQueryParamsSerializer(fn)`

Eigene Query-Parameter-Serialisierung. Default ist `URLSearchParams.toString()`.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

Falls eine eigene Serialisierung angegeben ist, erlauben HTTP- und SSE-Requests komplexe Query-Parameter.

---

## Transport-spezifische Konfiguration

### SSE-Optionen

Konfiguriere über `withSSEOptions` oder einzelne Konfigurationsfunktionen.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| Option               | Beschreibung                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `sse.fetch`          | SSE-spezifische `fetch`-Implementierung                                                                                  |
| `sse.reconnect`      | Wiederverbindungsstrategie: Versuche, Verzögerung, Backoff-Faktor, Jitter, max Verzögerung, eigene Entscheidungsfunktion |
| `sse.queue`          | Event-Warteschlange: max Kapazität, Overflow-Strategie                                                                   |
| `sse.onInvalidEvent` | Invalid-Event-Observer (fehlendes Schema oder Validierungsfehler)                                                        |
| `sse.maxBufferSize`  | Limit der zugrunde liegenden Puffergröße (Bytes)                                                                         |

### WebSocket-Optionen

Konfiguriere über `withWebSocketOptions` oder einzelne Konfigurationsfunktionen.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| Option                    | Beschreibung                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `webSocket.WebSocket`     | Eigener `WebSocket`-Konstruktor                                                                                          |
| `webSocket.protocols`     | RFC 6455 Subprotokoll-Array                                                                                              |
| `webSocket.beforeConnect` | Pre-Connect-Hook (z. B. dynamischen Token holen)                                                                         |
| `webSocket.heartbeat`     | Heartbeat: Intervall, Timeout, Message-Factory, ACK-Prädikat                                                             |
| `webSocket.reconnect`     | Wiederverbindungsstrategie: Versuche, Verzögerung, Backoff-Faktor, Jitter, max Verzögerung, eigene Entscheidungsfunktion |
| `webSocket.queue`         | Send-Warteschlange: max Kapazität, Overflow-Strategie                                                                    |

### Heartbeat-Details

WebSocket-Heartbeat erkennt Verbindungslebensfähigkeit. Falls konfiguriert, sendet das Framework Heartbeat-Nachrichten im `intervalMs`-Takt und wartet auf ACK innerhalb `timeoutMs`. Falls ACK ausbleibt, wird Wiederverbindung ausgelöst.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // Heartbeat alle 30s senden
  timeoutMs: 10000, // ACK muss innerhalb 10s eintreffen
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- Der Heartbeat-Message-Typ muss mit `outgoing`-Definitionen kompatibel sein.
- `isAck` bestimmt, ob eine eingehende Nachricht eine Heartbeat-Response ist. Wenn es `true` zurückgibt, landet die Nachricht nicht im `receive`-Iterator.

---

## Konfigurations-Komposition und Priorität

Konfigurationsfunktionen werden in Reihenfolge angewendet; spätere überschreiben frühere. Ausführungszeit-Optionen (`client.execute(cmd, { timeout: 5000 })`) haben die höchste Priorität, gefolgt von Client-Level-Konfiguration.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// SSE-Wiederverbindung zur Ausführungszeit überschreiben
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## Wie geht es weiter

- [Client →](/core/client) — Client-Erstellung und `execute`-Nutzung
- [Commands →](/core/commands) — Command-Definitionen und Input-Optional-Regeln
- [SSE →](/core/sse) — SSE-Ausführung, Wiederverbindung und Event-Handling
- [WebSocket →](/core/web-socket) — WebSocket-Verbindung, Heartbeat und State-Management
- [Interceptors →](/core/interceptors) — Interceptor-Typen und Zwiebelketten-Mechanik
