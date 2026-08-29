---
title: WebSocket
description: Typisierte JSON-Session starten, Envelopes empfangen und senden, dann schließen und closed awaiten.
---

# WebSocket

Start → receive → send → close + `await session.closed`. Du besitzt Unsubscribe und Disposal. Clients, Provider und Interceptors auto-schließen Sessions nicht.

## Basic Setup

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, openedSession, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using session = openedSession
  const unsubscribe = session.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    session.send({ type: 'send', text: 'Hello' })
    for await (const message of session.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## Der JSON-Envelope

`defineWebSocket(...)` beschreibt einen JSON-Message-Endpoint. Required `incoming`-Map wählt einen Struct nach Message-Type; optionales `outgoing` macht dasselbe für `session.send(...)`. Jede Wire-Message ist ein Object mit non-empty String `type`.

Object-Payload-Fields sitzen neben `type`. Scalar- und Array-Payloads nutzen das `data`-Feld des Envelopes:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

Die Message-Map kontrolliert den Payload, nicht den Envelope-Discriminator. `incoming.default` akzeptiert sonst undeclared Type-Namen; ohne ihn werden unknown Types gedroppt. Incoming Text-, `ArrayBuffer`-, Typed-Array- und `Blob`-Frames dekodieren als UTF-8-JSON. Malformed JSON und Struct-Failures gehen an Runtime-Error-Observer — nicht an `receive`.

Wenn ein Object-Payload ein Field namens `data` hat, bleibt es nach Encoding neben `type` (kein nested Envelope). Beispiel: `write` mit `{ data: string, source: string }` wirft als `{ type: 'write', data: string, source: string }`. Caller-seitiger Wert ist weiterhin `{ type: 'write', data: { data, source } }`, weil `data` den Object-Payload vor Serialization trägt. Aliasse gelten für Payload-Fields. Der `type`-Discriminator gehört zum Envelope, nicht zum Struct.

`session.send(...)` validiert und serialisiert synchron. Sendet sofort wenn open, queued während `reconnecting` wenn eine Outgoing-Queue enabled ist, throwt `InvalidStateError` wenn nicht writable. Throwt auch ohne Outgoing-Map, bei undeclared Type, Payload-Validation-Failure, disabled/voller Outgoing-Queue oder native Send-Failure.

`receive` ist One-Consumer. Ein zweiter Iterator wird rejected.

## State-Snapshots

| Member                     | Meaning                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `state`                    | `idle`, `connecting`, `open`, `reconnecting`, `closing`, `closed`, `aborted` oder `error`      |
| `connection`               | Latest physische Connection: `generation`, URL, negotiated Protocol, Extensions wenn verfügbar |
| `bufferedAmount`           | Native unsent Byte-Count, oder `0` ohne physischen Socket                                      |
| `receive`                  | One-Consumer Async-Iterable validierter Incoming-Messages                                      |
| `onStateChange(listener)`  | Logische State-Transitions abonnieren; gibt Unsubscribe zurück                                 |
| `onRuntimeError(listener)` | Non-Startup-Runtime-Errors abonnieren; gibt Unsubscribe zurück                                 |
| `closed`                   | Promise für das logische Terminal-Close-Outcome                                                |

`open` = physischer Socket open. `reconnecting` inkludiert Preparation + Delay vor einem Replacement. `connection.generation` inkrementiert jeden physischen Socket, der `open` erreicht. Tupel-`startupConnection` bleibt der erste erfolgreiche Snapshot; `session.connection` bewegt sich vorwärts.

Startup-Failure → `[error, undefined, connection?]`. Pre-Open-Constructor-Failure kann keine Connection haben; Timeout/Close während Startup kann trotzdem ein Snapshot liefern. Nach Session-Return reisen Runtime-Errors durch Observer, `receive` und `closed` — nicht durch ein zweites Execute-Tupel.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## Reconnect

Reconnect ist opt-in. Kein `reconnect`-Object → physisches Close endet die logische Session. Wenn konfiguriert, sind Defaults `attempts: 3`, `delayMs: 1000`, `factor: 2`, `maxDelayMs: 30000`, `jitter: 0`. `attempts` zählt Retries nach dem Initial-Attempt; `attempts: 0` disabled. Default-Predicate akzeptiert jedes Close-Outcome.

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` bekommt next Retry-Attempt, Close-Cause, Code, Reason und `wasClean`. Manuelles `session.close(...)` betritt das Predicate nicht. Throwende Preparation/Policy endet die logische Session mit Error.

WebSocket-Backoff-Jitter ist **multiplicative** (`jitter: 0.2` → Delay zwischen `0.8x` und `1.2x`). SSE-Jitter ist ein 0–1-multiplikativer Faktor, wie WebSocket. Delay-/Factor-/Jitter-/Attempt-Values werden vor dem Constructor validiert; Timer-Delays können `2_147_483_647` ms nicht überschreiten.

`beforeConnect({ attempt, signal })` läuft vor dem Initial-Constructor und jedem Reconnect. Gib sein Signal in Token-Refresh, damit Cancel Prep und Connect stoppt.

## Heartbeat

Opt-in auf Execute- oder Client-Scope. Interval sendet `message()` durch die Outgoing-Struct-Map. Optionales `isAck(message)` erkennt ein Ack — diese Message cleart den Timeout und wird **nicht** an `receive` delivered.

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` und `timeoutMs` müssen positive finite Timer ≤ `2_147_483_647` sein. Heartbeat-Message muss für die Outgoing-Map gültig sein. Serialization-, Native-Send-, Ack-Classification- und Timeout-Failures sind fatal für die logische Session — sie werden keine ordinary Reconnects.

## Queues

| Setting                | Required Value                                  | Behavior                                                                                                                   |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | Positive Safe Integer                           | Boundet geparste Messages, die auf `receive` warten, und Raw Frames, die auf Transform warten. Overflow → `state: 'error'` |
| `maxOutgoingQueueSize` | Optional non-negative Safe Integer; Default `0` | FIFO nur während `state === 'reconnecting'`. Full/disabled → `send(...)` throwt                                            |

Queued Outgoing-Frames flushen, bevor der Replacement-Socket `open` published. Frames, die schon auf einem früheren Socket gesendet wurden, werden nie auto-replayed. Reconnect-Queues sind für Messages, die du während Reconnecting sendest — nicht zum Reconstructing von App-State.

Incoming-Overflow cleart die Pending Sequence, failt `receive`, stoppt die Session, resolved `session.closed` mit `kind: 'error'`. Halte den Consumer schnell genug oder erhöhe das Bound aus measured Size/Memory.

## Protocols und Authentication

Definition-`protocols`, Client-`withWebSocketProtocols(...)` und Execute-`protocols` setzen die Constructor-Subprotocol-List. Precedence: Execution → Client → Definition. Erste definierte List wird für die logische Session kopiert und auf Reconnect reused.

Browser-WebSocket-Constructors akzeptieren keine beliebigen Handshake-Headers. Defjs konvertiert `http:` → `ws:` und `https:` → `wss:`, encoded Path-Placeholder einmal, nutzt den konfigurierten Query-Serializer. WebSocket-Query-Building serialisiert auch komplexe Query-Values als JSON (anders als Default-HTTP Scalar-only Query).

`withCredentials(true)` ist Fetch-Credentials für HTTP/SSE — nicht WebSocket-Auth. Nutze reviewed Cookie-/Session-Policy, Subprotocol oder ein short-lived Connection-Ticket. Packe keine allgemeinen Credentials oder long-lived Secrets in den Query String.

## Closure und Ownership

`session.close(code?, reason?)` requestet Terminal-Closure und stoppt Heartbeat. Code muss `1000` oder `3000..4999` sein; Reason ≤ 123 UTF-8 Bytes. Invalid Close-Args throwen vor State-Änderung.

`await using` fordert Close an und wartet dann auf den Defjs-eigenen Teardown. `close()` und `closed` bleiben verfügbar, wenn du einen manuellen Grund oder das logische Endergebnis brauchst.

Terminal-`kind`: `'closed'`, `'aborted'` oder `'error'`, mit optionalem native `code` / `reason` / `wasClean` und einem `cause` für Aborted/Error. `closed` beschreibt das logische Ende und beweist keinen physischen TCP-Close. Der Disposer hat einen auf eine Sekunde begrenzten Teardown; fehlt das Close-Event, beendet er Defjs-Cleanup und kann mit einer `DOMException` namens `TimeoutError` rejecten, während `closed` das logische manuelle Close-Ergebnis behält. Observed native Close-Fields gewinnen über den vom Owner requested Fallback.

## GraphQL-Grenze

Defjs liefert einen typisierten JSON-Envelope und einen logischen Session-Lifecycle. Es implementiert **kein** WebSocket-Application-Protocol. GraphQL-over-WebSocket-Features — Connection-Init, Operation-IDs, `next`/`error`/`complete`, Disposal, Subscription-Replay — liegen außerhalb des Core-Vertrags.

Nutze einen Protocol-Client wie `graphql-ws`, wenn der Server dieses Protocol verlangt, oder modele deinen eigenen Envelope mit `defineWebSocket(...)`. Eine Message-Map allein negotiiert keine GraphQL-Semantics.

## Verwandte Rezepte

- [WebSocket-Session öffnen](../recipes/websocket-session.md)
- [SSE-Stream konsumieren](../recipes/consume-sse.md)
