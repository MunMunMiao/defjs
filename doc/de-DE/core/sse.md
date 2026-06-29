---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs verwendet `defineEventStream`, um typisierte SSE- (Server-Sent Events) Endpunkte zu definieren. Nach der Ausführung wird ein Triplet `[error, stream, openInfo]` zurückgegeben, wobei `stream` ein async iterable ist, um servergepushte Events einzeln zu konsumieren.

## Event-Stream definieren

Bei der Definition eines SSE-Endpunkts deklariere das `events`-Feld, das Event-Namen auf Struct-Structta mapped. Das `data`-Feld jedes Event-Typs wird automatisch nach dem passenden Struct geparst.

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.number(),
      text: struct.string(),
    }),
    heartbeat: struct.string(),
  },
})
```

### Default-Event-Struct

Falls der Server Event-Typen senden könnte, die nicht explizit in `events` deklariert sind, stelle ein `default`-Struct bereit. Ohne `default` werden unbekannte Events stillschweigend verworfen.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### Event-Streams mit Input

Falls ein Stream Query-Parameter oder Request-Body braucht, gib `input`-Struct und `build`-Funktion an. Die `build`-Signatur ist dieselbe wie bei `defineRequest` und unterstützt Params, Query und Headers.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: {
    chat: struct.object({ user: struct.string(), text: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ roomId: '42' }))
```

## Ausführungsergebnis

`client.execute()` gibt ein Triplet für SSE-Commands zurück:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — Nicht-null bei Verbindungs- oder Validierungsfehler; `null` bei Erfolg.
- **`stream`** — Bei Erfolg ein `EventStreamHandle`, konsumierbar via `for await...of`; `undefined` bei Fehler.
- **`open`** — Enthält Erstverbindungs-Response-Info (`response` und `url`). Kann bei Verbindungsfehler `undefined` sein.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message') {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle und stream.closed

`EventStreamHandle` implementiert `AsyncIterable`, daher kann es direkt mit `for await...of` verwendet werden. Es bietet außerdem diese Eigenschaften:

| Eigenschaft / Methode      | Beschreibung                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `open`                     | Erstverbindung `EventStreamOpenInfo` (enthält `response` und `url`)                    |
| `closed`                   | `Promise<EventStreamCloseInfo>`, resolved, wenn der Stream vollständig geschlossen ist |
| `close(reason?)`           | Stream aktiv schließen, optional mit Reason                                            |
| `[Symbol.asyncIterator]()` | Gibt einen Async-Iterator zurück, der die Event-Warteschlange konsumiert               |

`closed` resolved, wenn:

- Server normales Ende (`code: 'eof'`)
- Aktives Schließen via `stream.close()` (`code: 'aborted'`)
- Verbindungsfehler oder Wiederverbindungserschöpfung (`code: 'error'`)

```typescript
// Aktives Schließen
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## Invalid-Event-Handling: onInvalidEvent

Falls der Server ein Event sendet, das keinem Struct in `events` (oder `default`) entspricht, oder die Struct-Validierung fehlschlägt, wird der `onInvalidEvent`-Observer ausgelöst. Er ist eine Client-Level-Konfiguration, die über `sse.onInvalidEvent` bei `createClient` übergeben wird.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Original error when validation fails
    },
  },
})
```

`onInvalidEvent` ist ein **Observer**:

- Auch wenn er intern wirft, wird die Exception stillschweigend ignoriert und der Stream läuft weiter.
- Er blockiert nicht nachfolgende Events vom Konsumieren.

## Wiederverbindung und Warteschlangen-Konfiguration

Der SSE-Transport hat eingebaute Auto-Wiederverbindung, konfigurierbar über `sse.reconnect` und `sse.queue` auf Client-Ebene.

### Wiederverbindungs-Konfiguration

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: {
      attempts: 5, // Max. Wiederverbindungsversuche
      delayMs: 1000, // Initiales Wiederverbindungsintervall
      factor: 2, // Exponentieller Backoff-Multiplikator
      maxDelayMs: 30000, // Max. Wiederverbindungsintervall
      jitter: 1000, // Zufälliger Jitter-Bereich (ms)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  },
})
```

Wiederverbindungspriorität:

1. Falls `onerror` `null` zurückgibt, Wiederverbindung stoppen.
2. Falls `shouldReconnect` `false` zurückgibt, Wiederverbindung stoppen.
3. Falls `attempts`-Limit überschritten, Wiederverbindung stoppen.
4. Andernfalls nächstes Wiederverbindungsintervall berechnen mit `delayMs` + `factor`-Exponentieller Backoff + `jitter`.

> Wiederverbindung trägt automatisch den `Last-Event-ID`-Header, damit der Server ab der Unterbrechung fortfahren kann.

### Warteschlangen-Konfiguration

Events treten nach Ankunft in eine interne Async-Warteschlange ein, dann werden sie vom Iterator konsumiert. Du kannst Warteschlangengröße und Overflow-Verhalten limitieren:

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  },
})
```

| `overflow`    | Verhalten                                                               |
| ------------- | ----------------------------------------------------------------------- |
| `drop-newest` | Neu angekommene Events verwerfen, alte Events in Warteschlange behalten |
| `drop-oldest` | Älteste Events verwerfen, Platz für neue Events schaffen                |
| `error`       | Warteschlange voll wirft Fehler, was Stream-Schließen auslöst           |

## Komplettes Beispiel

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  },
})

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.object({ level: struct.string(), msg: struct.string() }),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    console.log(`[${event.data.level}] ${event.data.msg}`)
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## Wie geht es weiter

- [Client →](/core/client) — `createClient` und `sse`-Optionen
- [Commands →](/core/commands) — Command-Definitionen und Input-Regeln
- [WebSocket →](/core/web-socket) — WebSocket-Verbindung und State-Management
