---
title: WebSocket
description: Start a typed JSON session, receive and send envelopes, then close and await closed.
---

# WebSocket

Start → receive → send → release with `await using`. You own unsubscribe and disposal. Manual `close()` / `closed` remains available; clients, providers, and interceptors don’t auto-close sessions.

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

const [error, session, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using ownedSession = session
  const unsubscribe = ownedSession.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    ownedSession.send({ type: 'send', text: 'Hello' })
    for await (const message of ownedSession.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## The JSON envelope

`defineWebSocket(...)` describes a JSON-message endpoint. Required `incoming` map selects a Struct by message type; optional `outgoing` does the same for `session.send(...)`. Every wire message is an object with a non-empty string `type`.

Object payload fields sit beside `type`. Scalar and array payloads use the envelope’s `data` field:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

The message map controls the payload, not the envelope discriminator. `incoming.default` accepts otherwise undeclared type names; without it, unknown types notify `withWebSocketOnInvalidEvent({ reason: 'missing-struct' })` (or are ignored when no observer is installed) and do **not** tear down the session. Incoming text, `ArrayBuffer`, typed-array, and `Blob` frames decode as UTF-8 JSON. Malformed JSON and Struct failures go to runtime-error observers — not to `receive`.

If an object payload has a field named `data`, it stays beside `type` after encoding (not a nested envelope). Example: `write` with `{ data: string, source: string }` wires as `{ type: 'write', data: string, source: string }`. Caller-side value is still `{ type: 'write', data: { data, source } }` because `data` carries the object payload before serialization. Aliases apply to payload fields. The `type` discriminator belongs to the envelope, not the Struct.

`session.send(...)` validates and serializes synchronously. Sends immediately when open, queues during `reconnecting` when an outgoing queue is enabled, throws `InvalidStateError` when not writable. Also throws when there’s no outgoing map, undeclared type, payload validation failure, disabled/full outgoing queue, or native send failure.

`receive` is one-consumer. A second iterator is rejected.

## State snapshots

| Member                     | Meaning                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `state`                    | `idle`, `connecting`, `open`, `reconnecting`, `closing`, `closed`, `aborted`, or `error`      |
| `connection`               | Latest physical connection: `generation`, URL, negotiated protocol, extensions when available |
| `bufferedAmount`           | Native unsent byte count, or `0` with no physical socket                                      |
| `receive`                  | One-consumer async iterable of validated incoming messages                                    |
| `onStateChange(listener)`  | Subscribe to logical state transitions; returns unsubscribe                                   |
| `onRuntimeError(listener)` | Subscribe to non-startup runtime errors; returns unsubscribe                                  |
| `closed`                   | Promise for the logical terminal close outcome                                                |

`open` = physical socket open. `reconnecting` includes preparation + delay before a replacement. `connection.generation` increments each physical socket that reaches `open`. Tuple `startupConnection` stays the first successful snapshot; `session.connection` moves forward.

Startup failure → `[error, undefined, connection?]`. Pre-open constructor failure may have no connection; timeout/close during startup may still provide a snapshot. After the session returns, runtime errors travel through observers, `receive`, and `closed` — not a second execute tuple.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## Reconnect

Reconnect is opt-in. No `reconnect` object → physical close ends the logical session. When configured, defaults are `attempts: 3`, `delayMs: 1000`, `factor: 2`, `maxDelayMs: 30000`, `jitter: 0`. `attempts` counts retries after the initial attempt; `attempts: 0` disables. Default predicate accepts every close outcome.

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

`shouldReconnect` gets next retry attempt, close cause, code, reason, and `wasClean`. Manual `session.close(...)` does not enter the predicate. Throwing preparation/policy ends the logical session with an error.

WebSocket backoff jitter is **multiplicative** (`jitter: 0.2` → delay between `0.8x` and `1.2x`). SSE jitter is a 0–1 multiplicative factor, same as WebSocket. Delay/factor/jitter/attempt values are validated before the constructor; timer delays can’t exceed `2_147_483_647` ms.

`beforeConnect({ attempt, signal })` runs before the initial constructor and every reconnect. Pass its signal into token refresh so cancel stops both prep and connect.

## Heartbeat

Opt-in at execute or client scope. Interval sends `message()` through the outgoing Struct map. Optional `isAck(message)` recognizes an ack — that message clears the timeout and is **not** delivered to `receive`.

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

`intervalMs` and `timeoutMs` must be positive finite timers ≤ `2_147_483_647`. Heartbeat message must be valid for the outgoing map. Serialization, native send, ack classification, and timeout failures are fatal to the logical session — they don’t become ordinary reconnects.

## Queues

| Setting                | Required value                                  | Behavior                                                                                                       |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | Positive safe integer                           | Bounds parsed messages waiting for `receive` and raw frames waiting for transform. Overflow → `state: 'error'` |
| `maxOutgoingQueueSize` | Optional non-negative safe integer; default `0` | FIFO only while `state === 'reconnecting'`. Full/disabled → `send(...)` throws                                 |

Queued outgoing frames flush before the replacement socket publishes `open`. Frames already sent on an earlier socket are never auto-replayed. Reconnect queues are for messages you send while reconnecting — not for reconstructing app state.

Incoming overflow clears the pending sequence, fails `receive`, stops the session, resolves `session.closed` with `kind: 'error'`. Keep the consumer fast enough or raise the bound from measured size/memory.

## Protocols and authentication

Definition `protocols`, client `withWebSocketProtocols(...)`, and execute `protocols` set the constructor subprotocol list. Precedence: execution → client → definition. First defined list is copied for the logical session and reused on reconnect.

Browser WebSocket constructors don’t accept arbitrary handshake headers. Defjs converts `http:` → `ws:` and `https:` → `wss:`, encodes path placeholders once, uses the configured query serializer. WebSocket query building also serializes complex query values as JSON (unlike default HTTP scalar-only query).

`withCredentials(true)` is Fetch credentials for HTTP/SSE — not WebSocket auth. Use reviewed cookie/session policy, subprotocol, or a short-lived connection ticket. Don’t put general credentials or long-lived secrets in the query string.

## Closure and ownership

`session.close(code?, reason?)` requests terminal closure and stops heartbeat. Code must be `1000` or `3000..4999`; reason ≤ 123 UTF-8 bytes. Invalid close args throw before changing state. Use it with `await session.closed` when you need a manual close reason or the logical terminal result.

```typescript twoslash
import type { WebSocketSession } from '@defjs/core'

async function observeSession(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  console.log(ownedSession.state)
}

void observeSession
```

`session.closed` is the logical terminal snapshot: `'closed'`, `'aborted'`, or `'error'`, with optional native `code` / `reason` / `wasClean` and a `cause` for aborted/error. Observed native close fields win over the owner’s requested fallback.

The standard async disposer requests best-effort native close, then waits for Defjs-owned lifecycle, message-pump, timer, listener, queue, and socket-reference teardown. If a close event is not observed within one second, teardown is forced and the disposer may reject with a `DOMException` named `TimeoutError`; this does not prove that the physical TCP connection closed. Repeated disposer calls share the same teardown. Custom structural session implementations must now provide the same `[Symbol.asyncDispose](): PromiseLike<void>` contract.

## GraphQL boundary

Defjs supplies a typed JSON envelope and a logical session lifecycle. It does **not** implement a WebSocket application protocol. GraphQL-over-WebSocket features — connection init, operation IDs, `next`/`error`/`complete`, disposal, subscription replay — are outside the core contract.

Use a protocol client like `graphql-ws` when the server requires that protocol, or model your own envelope with `defineWebSocket(...)`. A message map alone does not negotiate GraphQL semantics.

## Related recipes

- [Open a WebSocket session](../recipes/websocket-session.md)
- [Consume an SSE stream](../recipes/consume-sse.md)
