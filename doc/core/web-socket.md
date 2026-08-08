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

WebSocket returns:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

The third item on success is the startup-connection snapshot. It can contain `url`, `protocol`, and `extensions` captured when the first physical socket opened.

`session.connection` is a live getter. Reconnect replaces the underlying physical socket and can update this value. Keep the tuple's third item when the startup snapshot matters.

Do not log connection URLs. They can contain path identifiers, application query data, and telemetry propagation fields.

## Live Session

A `WebSocketSession` is one logical session that can span several physical connection attempts.

| Member                     | Behavior                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `connection`               | Live latest connection information.                              |
| `state`                    | Live logical session state.                                      |
| `receive`                  | Shared async work queue of validated incoming messages.          |
| `send(message)`            | Validate, serialize, then send or enqueue an outgoing message.   |
| `close(code?, reason?)`    | Request terminal closure.                                        |
| `closed`                   | Promise for observed terminal close information.                 |
| `onStateChange(listener)`  | Add a state observer and return an unsubscribe function.         |
| `onRuntimeError(listener)` | Add a runtime-error observer and return an unsubscribe function. |

The client does not track the session after returning it. The caller owns consumption, observers, cancellation, and close.

## Receive Messages

Text, ArrayBuffer, typed-array, and Blob messages are decoded as UTF-8 JSON. These inputs are silently dropped:

- invalid JSON;
- a non-object envelope;
- a missing or empty string `type`;
- an unknown type with no `incoming.default` Struct.

Once a Struct is selected, a decoding failure is sent to `onRuntimeError` and that message is dropped.

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

The incoming iterable is one unbounded shared work queue. Multiple iterators compete for messages; they are not independent subscriptions. The transport does not slow the server when the queue grows. Always consume incoming messages or close the session promptly.

## Send Messages

`send(...)` is synchronous. It can throw synchronously when:

- the endpoint has no `outgoing` map;
- the message has no valid `type`;
- the type is undeclared;
- payload structural decoding or encoding fails;
- a bounded send queue uses `overflow: 'error'`;
- the native socket throws during an immediate send.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

Messages sent before open or between reconnect attempts enter the outgoing send queue. The queue flushes when a physical socket opens.

Do not call `send` after a terminal state. The current implementation does not provide a stable post-close rejection contract, and queued data after terminal close may never be sent.

## State

`session.state` can be:

| State          | Meaning                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | Initial internal state before execution starts.                                                                                                             |
| `connecting`   | The first physical attempt is starting.                                                                                                                     |
| `open`         | The most recently emitted logical state after a physical socket opened. During a reconnect delay, it can remain `open` even when no physical socket exists. |
| `reconnecting` | A later physical attempt is starting after its delay.                                                                                                       |
| `closing`      | An active connecting/open socket is being closed by cancellation.                                                                                           |
| `closed`       | Terminal close without a normalized error.                                                                                                                  |
| `aborted`      | Terminal external cancellation normalized to `ABORTED`.                                                                                                     |
| `error`        | Other terminal failure.                                                                                                                                     |

`reconnecting` is not emitted during the delay. It is emitted when the next attempt starts after the delay. Treat `session.state` as the latest emitted lifecycle state, not as proof that a native socket currently exists. Messages sent during that gap enter the outgoing queue.

State listeners run directly. Keep them non-throwing and unsubscribe them when their owner ends.

### Before Each Attempt

`beforeConnect` can be configured on the client or one execution. It runs before the native constructor on the initial attempt and every reconnect attempt:

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

The command input and request projection have already been built. The hook does not rerun `build` or change bound query values. Use it for application-owned preparation such as refreshing state used by the environment's handshake mechanism. A throw or rejection is a terminal transport failure; it is not passed to the close-outcome reconnect predicate.

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

The default predicate retries clean and unclean remote closes. Set a predicate when clean close should be terminal. `attempt` starts at 1 for the first retry.

The base delay is `min(delayMs * factor ** (attempt - 1), maxDelayMs)`. WebSocket jitter is multiplicative: a value such as `0.2` selects a random factor from `0.8` through `1.2`. This differs from SSE's additive millisecond jitter.

Keep `shouldReconnect` synchronous and non-throwing. Reconnect covers a new physical socket within the same logical session. The incoming and outgoing queues belong to that logical session.

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

When a positive `timeoutMs` expires, the runtime emits `Error('WebSocket heartbeat timeout')` to runtime-error listeners and requests native close code `4000` with reason `heartbeat timeout`. Reconnect still requires a separate reconnect policy that permits the resulting close.

Keep `timeoutMs < intervalMs`. The current implementation does not validate this relation, and a timeout at or above the interval can overlap later heartbeat timers.

## Queues

The `queue` option configures only outgoing messages:

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

The outgoing queue is unbounded by default. When bounded, its default overflow mode is `drop-oldest`; alternatives are `drop-newest` and `error`. Terminal close clears this send queue.

The incoming queue has no public bound or overflow option. It is an unbounded shared work queue and provides no backpressure. Resource owners must consume it continuously or close the session.

## Closure Ownership

`session.close(code, reason)` calls the current native socket's `close` method and aborts the logical session with a manual-close marker. It requests closure; it does not guarantee a graceful handshake, a visible `closing` state, or that the eventual `closed` value exactly echoes the requested code and reason.

`session.closed` resolves from the close information the runtime observes:

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

A native implementation that never emits its close event can delay settlement. External cancellation can finish as `aborted` or `error` depending on the normalized reason and can skip `closing` while the session is between attempts.

Unsubscribe listeners and close at the component, route, job, or service boundary that opened the session. Provider unmount alone does not do this work.

## URL and Authentication Safety

HTTP base URLs are converted to WebSocket schemes: `http:` becomes `ws:` and `https:` becomes `wss:`. Path placeholders are not segment-encoded. Query values use the configured serializer.

Protocol precedence is execution option, then client option, then endpoint definition. An explicit empty protocol array suppresses lower-precedence values.

Browser WebSocket APIs cannot set arbitrary handshake headers. Do not treat query parameters as a general credential channel; URLs can be recorded by browser tools, proxies, access logs, and telemetry. Use TLS (`wss:`) and an authentication design reviewed for the deployment, such as an appropriate same-site cookie flow or short-lived connection ticket.

## Next

- [SSE](/core/sse) contrasts stream retry and queue behavior.
- [Interceptors](/core/interceptors) shows how to preserve live session getters.
- [Errors](/core/errors) covers startup tuple failures.
