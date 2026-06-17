---
title: WebSocket
description: Typed WebSocket endpoints with schema-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` bietet typisierte WebSocket-Endpunkte über `defineWebSocket`. Jeder Endpoint deklariert:

- `incoming`-Schemata — Nachrichten, die der Server an den Client sendet.
- `outgoing`-Schemata — Nachrichten, die der Client an den Server sendet.
- `input`-Schema + `build`-Handler — Request-Parameter und Query/Path-Konstruktion (optional).

Nachrichten werden JSON-kodiert und zur Laufzeit gegen die deklarierten Schemata validiert.

## WebSocket-Endpunkt definieren

Verwende `defineWebSocket`, um einen typisierten Command-Builder zu erstellen. Der Builder wird dann mit `client.execute()` ausgeführt.

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // Optional: Verbindungs-URL aus Input bauen
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // Nachrichten von Server → Client
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // Nachrichten von Client → Server
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### Schema-Formen

**Incoming-Nachrichten** sind nach `type` keyed. Wenn eine Nachricht ankommt, wird ihr JSON-`type`-Feld gegen die Schema-Keys gematcht. Falls der Payload ein Plain-Object ist, werden seine Felder mit `type` gemerged:

```typescript
// Server sends: { "type": "message", "text": "hi", "userId": 1 }
// Client receives: { type: 'message', text: 'hi', userId: 1 }
```

Falls der Payload ein Skalar oder Array ist, wird er unter `data` gewrapped:

```typescript
// Server sends: { "type": "notification", "data": [1, 2, 3] }
// Client receives: { type: 'notification', data: [1, 2, 3] }
```

**Outgoing-Nachrichten** folgen derselben Konvention. Die `send()`-Methode akzeptiert eine Nachricht mit einem `type`, der einem `outgoing`-Key entspricht:

```typescript
socket.send({ type: 'message', text: 'hello' })
```

Ein spezieller `default`-Key kann in `incoming` verwendet werden, um nicht deklarierte Message-Typen mit einem Shared-Schema abzufangen.

## Ausführen und Konsumieren von Nachrichten

`client.execute()` gibt ein Tuple `[error, socket, connection]` zurück:

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // handle start-up failure (validation, transport, abort, etc.)
  return
}

// Eingehende Nachrichten iterieren
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// Oder den Async-Iterator direkt verwenden
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## `WebSocketSession`-API

| Member                     | Typ                                        | Beschreibung                                                                    |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | `{ url?, protocol?, extensions? }` aus dem zugrunde liegenden Socket.           |
| `state`                    | `WebSocketState`                           | Aktueller Lifecycle-Status (siehe unten).                                       |
| `receive`                  | `AsyncIterable<TIncoming>`                 | Async-Iterator validierter eingehender Nachrichten.                             |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | Resolved, wenn der Socket mit `{ code?, reason?, wasClean?, cause? }` schließt. |
| `send(message)`            | `(message: TOutgoing) => void`             | Sendet eine ausgehende Nachricht. Warteschlangen, falls noch nicht offen.       |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | Schließt die Verbindung graceful.                                               |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | Gibt eine Unsubscribe-Funktion zurück.                                          |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | Gibt eine Unsubscribe-Funktion zurück.                                          |

```typescript
// Zustandsüberwachung
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// Laufzeitfehler (Schema-Fehler, Heartbeat-Timeout etc.)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// Graceful Close
socket.close(1000, 'done')
await socket.closed
```

## Verbindungs-Lifecycle-Zustandsmaschine

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| Zustand        | Bedeutung                                                                             |
| -------------- | ------------------------------------------------------------------------------------- |
| `idle`         | Bevor `execute()` aufgerufen wird.                                                    |
| `connecting`   | Erster Verbindungsversuch wird geöffnet.                                              |
| `open`         | Verbindung hergestellt, Nachrichten können fließen.                                   |
| `closing`      | `close()` oder `abort` wurde ausgelöst, wartet auf Close-Event.                       |
| `closed`       | Sauberes Schließen (kein Fehler, oder manuelles Schließen).                           |
| `reconnecting` | Verbindung abgebrochen, wartet vor Retry.                                             |
| `error`        | Terminaler Fehler (Validierungsfehler, Transportfehler, Nicht-Abort-Close mit Cause). |
| `aborted`      | Explizit abgebrochen via `AbortSignal` oder `close()`.                                |

Zustandsübergänge werden via `onStateChange` emitted. Der `receive`-Async-Iterator endet, wenn der Socket einen Terminalzustand (`closed`, `error` oder `aborted`) erreicht.

## Heartbeat

Konfiguriere periodisches Ping/Ack, um die Verbindung am Leben zu halten oder tote Peers zu erkennen.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // alle 30s senden
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // Ack innerhalb 10s erwarten
    isAck: (message) => message.type === 'pong',
  },
})
```

| Option       | Beschreibung                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `intervalMs` | Intervall zwischen Heartbeat-Sends (erforderlich).                                               |
| `message`    | Factory, die die Heartbeat-Nachricht zurückgibt. Typed gegen `TOutgoing`.                        |
| `timeoutMs`  | Falls gesetzt, wird der Socket mit Code `4000` geschlossen, wenn kein Ack rechtzeitig eintrifft. |
| `isAck`      | Prädikat, um eine eingehende Nachricht als Heartbeat-Ack zu erkennen.                            |

Heartbeat kann per Client (via `createClient({ webSocket: { heartbeat: ... } })`) oder per Request (via `execute()`-Optionen) konfiguriert werden. Request-Level-Config gewinnt.

## Wiederverbindung

Automatische Wiederverbindung wird ausgelöst, wenn die Verbindung unerwartet abbricht.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| Option            | Default      | Beschreibung                                                         |
| ----------------- | ------------ | -------------------------------------------------------------------- |
| `attempts`        | `3`          | Max. Wiederverbindungsversuche. `<= 0` deaktiviert Wiederverbindung. |
| `delayMs`         | `1000`       | Basisverzögerung vor dem ersten Retry.                               |
| `factor`          | `2`          | Exponentieller Backoff-Multiplikator.                                |
| `maxDelayMs`      | `30000`      | Obergrenze der berechneten Verzögerung.                              |
| `jitter`          | `0`          | Randomisierungsfaktor (`0`–`1`).                                     |
| `shouldReconnect` | `() => true` | Prädikat, ob ein gegebenes Close einen Retry auslösen soll.          |

Verzögerungsformel: `min(delayMs * factor^(attempt - 1), maxDelayMs)`, dann jittered.

Wiederverbindung ist auch auf Client-Ebene via `createClient({ webSocket: { reconnect: ... } })` konfigurierbar.

## Send-Warteschlange

Nachrichten, die gesendet werden, bevor der Socket `open` ist (oder während einer transienten Trennung), werden in eine Warteschlange eingereiht und geflushed, sobald die Verbindung bereit ist.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| Option     | Beschreibung                                             |
| ---------- | -------------------------------------------------------- |
| `maxSize`  | Max. Warteschlangen-Nachrichten. Default ist unbegrenzt. |
| `overflow` | Verhalten, wenn `maxSize` überschritten wird.            |

Die Warteschlange wird bei terminalen Close (`error`, `aborted`, `closed`) geleert.

## Manuelles Schließen und Abort-Verhalten

### `socket.close(code?, reason?)`

Führt ein graceful Close aus:

1. Ruft native `WebSocket.close(code, reason)` auf.
2. Bricht internen `AbortController` mit `manual-web-socket-close`-Reason ab.
3. Der Socket transitioniert durch `closing` → `closed`.
4. `socket.closed` resolved mit den übergebenen `code` und `reason`.

### `AbortSignal` (extern)

Übergib ein externes `AbortSignal` via `execute()`-Optionen:

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// Später:
controller.abort() // schließt den Socket sofort und transitioniert zu 'aborted'
```

Falls **vor** dem Socket-Open abgebrochen wird, resolved `execute()` mit einem Transportfehler und `socket` ist `undefined`. Falls **nach** dem Open abgebrochen wird, transitioniert der Socket zu `aborted` und `receive` endet.

### `timeout`

Request-Level-Timeout wird unterstützt, kann aber nicht mit `abort` im selben Request kombiniert werden (ein Definition-Error wird zurückgegeben):

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// Error — cannot mix abort and timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## Komplettes Beispiel

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## Wie geht es weiter

- [SSE →](/core/sse) — Server-Sent Events mit typisierten Schemata und Wiederverbindung.
- [Client →](/core/client) — Client-Erstellung und WebSocket-Konfiguration.
- [Commands →](/core/commands) — `defineWebSocket`-Input- und Build-Regeln.
