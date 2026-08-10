---
title: WebSocket
description: Define message envelopes, start and observe live sessions, consume incoming work, configure opt-in reconnect and heartbeat, and close owned resources.
---

# WebSocket

`defineWebSocket(...)` creates a command builder for a JSON-message WebSocket endpoint.

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## Message Envelope

Every message uses a JSON object with a non-empty string `type`. The type selects a Struct from `incoming` or `outgoing`.

For an object payload, fields can sit beside `type`:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

For a scalar or array payload, put the payload in `data`:

```json
{ "type": "count", "data": 3 }
```

`type` and `data` are reserved envelope keys. If an object payload itself contains a `data` field, wrap the entire payload so the runtime does not mistake that field for the envelope payload:

```typescript
const audit = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

The corresponding wire shape is `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`.

Do not declare `type` as an ordinary payload field. Envelope normalization owns it.

An optional `incoming.default` Struct handles otherwise undeclared message types. Without it, unknown types are dropped.

## Startup Tuple

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

For HTTP, SSE, and WebSocket execution, `timeout` must be a positive safe integer in `1..2_147_483_647`; `0`, negative or fractional values, `NaN`, `Infinity`, and values above the limit return `REQUEST_VALIDATION_FAILED` before any request, stream, or socket resource is created.

WebSocket returns:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

The third item on success is the startup-connection snapshot. It has `generation: 1` and can contain `url`, `protocol`, and `extensions` captured when the first physical socket opened.

`session.connection` is a live getter. Each successful physical open increments `generation`; reconnect replaces the underlying socket and updates this value. Keep the tuple's third item when the startup snapshot matters.

Do not log connection URLs. They can contain path identifiers, application query data, and telemetry propagation fields.

## Live Session

A `WebSocketSession` is one logical session that can span several physical connection attempts.

| Member                     | Behavior                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `connection`               | Live latest connection information.                               |
| `bufferedAmount`           | Current native socket's unsent byte count, or `0` without one.    |
| `state`                    | Live logical session state.                                       |
| `receive`                  | Shared async work queue of validated incoming messages.           |
| `send(message)`            | Check writability, then validate, serialize, and send or enqueue. |
| `close(code?, reason?)`    | Request terminal closure.                                         |
| `closed`                   | Promise for observed terminal close information.                  |
| `onStateChange(listener)`  | Add a state observer and return an unsubscribe function.          |
| `onRuntimeError(listener)` | Add a runtime-error observer and return an unsubscribe function.  |

The client does not track the session after returning it. The caller owns consumption, observers, cancellation, and close.

## Receive Messages

Text, ArrayBuffer, typed-array, and Blob messages are decoded in arrival order as UTF-8 JSON. These inputs are silently dropped:

- a non-object envelope;
- a missing or empty string `type`;
- an unknown type with no `incoming.default` Struct.

Malformed JSON and selected-Struct validation failures are sent to `onRuntimeError`; the frame is dropped and the session continues.

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

`receive` allows exactly one iterator. `maxIncomingQueueSize` is a required positive safe-integer item bound. Overflow discards buffered values, fails the iterator, and terminates the session as `error`; it never returns a partial sequence after dropping frames. Always consume incoming messages or close the session promptly.

## Send Messages

`send(...)` is synchronous. It can throw synchronously when:

- the endpoint has no `outgoing` map;
- the message has no valid `type`;
- the type is undeclared;
- payload structural decoding or encoding fails;
- the endpoint-owned outgoing queue is disabled or full while no socket is open;
- the native socket throws during an immediate send.

Logical writability is checked before payload validation or serialization. A frame is sent directly only while the logical state is `open` and the current physical socket is open. Manual closing, terminal state, and the remote-close window while a reconnect predicate is unresolved all throw `InvalidStateError`.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

`maxOutgoingQueueSize` is an optional endpoint-definition item bound. It defaults to `0`, so sends during `reconnecting` fail visibly. A positive capacity retains frames in FIFO order and flushes them before the replacement socket publishes `open`; overflow throws without discarding older frames.

After a terminal state, `send` throws `InvalidStateError`. Transport reconnect never replays a frame that was already sent to a previous physical socket.

## State

`session.state` can be:

| State          | Meaning                                                 |
| -------------- | ------------------------------------------------------- |
| `idle`         | Initial internal state before execution starts.         |
| `connecting`   | The first physical attempt is starting.                 |
| `open`         | A physical socket is open.                              |
| `reconnecting` | A later physical attempt is being prepared or delayed.  |
| `closing`      | The owner requested a manual close.                     |
| `closed`       | Terminal close without a normalized error.              |
| `aborted`      | Terminal external cancellation normalized to `ABORTED`. |
| `error`        | Other terminal failure.                                 |

Treat `session.state` as the logical lifecycle state, not proof that a native socket currently exists. During `reconnecting`, `send` uses the endpoint-owned outgoing capacity described above.

Observer failures are isolated: a state-listener failure is reported to runtime-error listeners, and a runtime-error listener failure is forwarded to `globalThis.reportError` when available. Terminal settlement releases all observers; still unsubscribe when the owner ends earlier.

### Before Each Attempt

`beforeConnect` can be configured on the client or one execution. It runs before the native constructor on the initial attempt and every reconnect attempt:

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

The hook receives `{ attempt, signal }`; `attempt` is `0` initially and increments for reconnects. Pass `signal` into owned async work. Abort and timeout race the hook, consume late rejection, and never construct a socket from a late result. A throw or rejection is a terminal transport failure.

## Reconnect Is Opt-In

No reconnect object means no reconnect. Configure it per client or per execution:

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

`attempts` means retries after the initial attempt. Passing an empty object enables three retries with these defaults:

| Field             | Default                                |
| ----------------- | -------------------------------------- |
| `attempts`        | `3`                                    |
| `delayMs`         | `1000`                                 |
| `factor`          | `2`                                    |
| `maxDelayMs`      | `30000`                                |
| `jitter`          | `0`                                    |
| `shouldReconnect` | Return `true` for every close outcome. |

The default predicate retries clean and unclean remote closes. Set a predicate when a close should be terminal. An explicitly invoked predicate that returns `false` settles an exposed session as `closed`; a thrown predicate settles it as `error`. `attempt` starts at 1 for the first retry.

The base delay is `min(delayMs * factor ** (attempt - 1), maxDelayMs)`. WebSocket jitter is multiplicative: a value such as `0.2` selects a random factor from `0.8` through `1.2`. This differs from SSE's additive millisecond jitter.

`attempts` must be a non-negative safe integer; `0` disables reconnect. Delay fields must be finite and non-negative, `factor` must be positive and finite, and `jitter` must be between `0` and `1`. A finite computed delay above `2_147_483_647` ms is clamped to that platform timer limit; a non-finite result is a terminal error instead of a hot retry loop.

Reconnect covers a new physical socket within the same logical session, but Core does not replay prior sends. Applications may track explicitly replayable subscriptions and resend only active ones when `session.connection.generation` increases. Never use that recipe for mutations or other non-idempotent frames.

## Heartbeat

Heartbeat is also opt-in:

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

`message` must produce a value valid for the endpoint's outgoing map. A message recognized by `isAck` clears the heartbeat timeout and is not added to `receive`.

Heartbeat serialization, send, acknowledgement predicate, and timeout failures are fatal. They notify runtime-error listeners, fail `receive`, and settle the logical session as `error` without consulting reconnect policy.

`intervalMs` and a defined `timeoutMs` must each be positive, finite, and at most `2_147_483_647`. While one acknowledgement deadline is active, later interval ticks do not send another ping or reset that deadline; an acknowledgement or session stop clears it.

## Queues

Queue limits belong to the endpoint definition so every caller shares one reviewed memory policy:

| Definition field       | Contract                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | Required positive safe integer. Overflow is fatal and discards the buffered incoming sequence.        |
| `maxOutgoingQueueSize` | Optional non-negative safe integer, default `0`. Positive values retain FIFO frames between attempts. |

Both limits count items, not bytes. `session.bufferedAmount` exposes the native socket's byte backlog separately. Terminal settlement clears unsent outgoing frames.

## Closure Ownership

`session.close(code, reason)` validates code `1000` or `3000..4999` and a reason of at most 123 UTF-8 bytes before changing state. Valid input enters `closing`, requests native close, and waits for the physical `CloseEvent`; the observed code and reason win over owner intent.

`session.closed` resolves from the close information the runtime observes:

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

Manual close, cause-free remote close, and an explicitly declined reconnect policy produce `closed`. External abort produces `aborted`; timeout and runtime failures produce `error`. A native close implementation that throws gets one no-argument fallback; if both calls throw, the logical session settles as `error` without a third close call.

Unsubscribe listeners and close at the component, route, job, or service boundary that opened the session. Provider unmount alone does not do this work.

## GraphQL over WebSocket

Core WebSocket commands validate application frames and manage one logical socket session. They do not implement the `graphql-transport-ws` protocol: connection initialization and acknowledgement, operation IDs, multiplexed `next`/`error`/`complete` frames, subscription disposal, and reconnect resubscription remain application-owned.

For a GraphQL-first application, prefer a protocol implementation such as `graphql-ws` and provide the WebSocket constructor required by that library and runtime. Use Defjs WebSocket commands when the wire protocol itself is your typed application contract. Do not treat Core reconnect as automatic GraphQL operation replay, especially for mutations.

## URL and Authentication Safety

HTTP base URLs are converted to WebSocket schemes: `http:` becomes `ws:` and `https:` becomes `wss:`. Supply raw path-placeholder values: Core segment-encodes each exactly once, `%` becomes `%25`, and empty, `.` or `..` values are rejected. Query values use the configured serializer.

Protocol precedence is execution option, then client option, then endpoint definition. An explicit empty protocol array suppresses lower-precedence values.

Browser WebSocket APIs cannot set arbitrary handshake headers. Do not treat query parameters as a general credential channel; URLs can be recorded by browser tools, proxies, access logs, and telemetry. Use TLS (`wss:`) and an authentication design reviewed for the deployment, such as an appropriate same-site cookie flow or short-lived connection ticket.

## Next

- [SSE](./sse.md) contrasts stream retry and queue behavior.
- [Interceptors](./interceptors.md) shows how to preserve live session getters.
- [Errors](./errors.md) covers startup tuple failures.
