---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` provides typed WebSocket endpoints via `defineWebSocket`. Each endpoint declares:

- `incoming` structs — messages the server sends to the client.
- `outgoing` structs — messages the client sends to the server.
- `input` struct + `build` handler — request parameters and query/path construction (optional).

Messages are JSON-encoded and validated at runtime against the declared structs.

## Defining a WebSocket Endpoint

Use `defineWebSocket` to create a typed command builder. The builder is then executed with `client.execute()`.

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useChatSocket = defineWebSocket({
  // Optional: build the connection URL from input
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setQueryParams({ roomId: input.query.roomId })
  },

  // Messages from server → client
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // Messages from client → server
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### Struct Shapes

**Incoming messages** are keyed by `type`. When a message arrives, its JSON `type` field is matched against the struct keys. If the payload is a plain object, its fields are merged with `type`:

```typescript
// Server sends: { "type": "message", "text": "hi", "userId": 1 }
// Client receives: { type: 'message', text: 'hi', userId: 1 }
```

If the payload is a scalar or array, it is wrapped under `data`:

```typescript
// Server sends: { "type": "notification", "data": [1, 2, 3] }
// Client receives: { type: 'notification', data: [1, 2, 3] }
```

**Outgoing messages** follow the same convention. The `send()` method accepts a message with a `type` matching one of the `outgoing` keys:

```typescript
socket.send({ type: 'message', text: 'hello' })
```

A special `default` key can be used in `incoming` to catch undeclared message types with a shared struct.

## Executing and Consuming Messages

`client.execute()` returns a tuple `[error, socket, connection]`:

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // handle start-up failure (validation, transport, abort, etc.)
  return
}

// Iterate incoming messages
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

// Or use the async iterator directly
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## `WebSocketSession` API

| Member                     | Type                                       | Description                                                                   |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | `{ url?, protocol?, extensions? }` from the underlying socket.                |
| `state`                    | `WebSocketState`                           | Current lifecycle state (see below).                                          |
| `receive`                  | `AsyncIterable<TIncoming>`                 | Async iterator of validated incoming messages.                                |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | Resolves when the socket closes with `{ code?, reason?, wasClean?, cause? }`. |
| `send(message)`            | `(message: TOutgoing) => void`             | Sends an outgoing message. Queued if not yet open.                            |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | Closes the connection gracefully.                                             |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | Returns an unsubscribe function.                                              |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | Returns an unsubscribe function.                                              |

```typescript
// State monitoring
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// Runtime errors (struct failures, heartbeat timeout, etc.)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// Graceful close
socket.close(1000, 'done')
await socket.closed
```

## Connection Lifecycle State Machine

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| State          | Meaning                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | Before `execute()` is called.                                                                                                                                                                        |
| `connecting`   | Opening the first connection attempt.                                                                                                                                                                |
| `open`         | Connection established, messages can flow.                                                                                                                                                           |
| `closing`      | A current `CONNECTING`/`OPEN` socket is being shut down, typically by an external abort, while waiting for the close event. Manual `close()` is not guaranteed to expose this state publicly.        |
| `closed`       | Clean close (no error, including manual `close()`).                                                                                                                                                  |
| `reconnecting` | Connection dropped, waiting before retry.                                                                                                                                                            |
| `error`        | Terminal failure (validation error, transport error, non-abort close with cause, or an external abort whose reason does not normalize to `ABORTED`).                                                 |
| `aborted`      | External cancellation normalized to transport code `ABORTED` after the socket lifecycle has started (for example default `controller.abort()`, `ERR_ABORTED`, or a DOMException named `AbortError`). |

State transitions are emitted via `onStateChange`. After startup, an external abort only passes through `closing` when there is a current socket in `CONNECTING` or `OPEN`. If the runtime is between attempts during reconnect delay, the session finishes directly in `aborted` or `error` without re-entering `closing`. It reaches `aborted` only when the merged abort reason normalizes to transport code `ABORTED` (for example the default abort reason, `ERR_ABORTED`, or a DOMException named `AbortError`); other custom reasons finish in `error`. Manual `close()` still ends in `closed`, but consumers must not rely on observing a public `closing` state for that path. The `receive` async iterator ends when the socket reaches a terminal state (`closed`, `error`, or `aborted`).

## Heartbeat

Configure periodic ping/ack to keep the connection alive or detect dead peers.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // send every 30s
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // expect ack within 10s
    isAck: (message) => message.type === 'pong',
  },
})
```

| Option       | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `intervalMs` | Interval between heartbeat sends (required).                               |
| `message`    | Factory returning the heartbeat message. Typed against `TOutgoing`.        |
| `timeoutMs`  | If set, the socket is closed with code `4000` when no ack arrives in time. |
| `isAck`      | Predicate to recognize an incoming message as a heartbeat ack.             |

Heartbeat can be configured per-client with `withWebSocketHeartbeat(...)` or `withWebSocketOptions({ heartbeat: ... })`, and per-request via `execute()` options. Request-level config wins.

```typescript
import { createClient, withEndpoint, withWebSocketHeartbeat, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHeartbeat({
    intervalMs: 30_000,
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000,
    isAck: (message) => typeof message === 'object' && message !== null && 'type' in message && message.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
  }),
)
```

The configured heartbeat message still needs to match the endpoint's outgoing schema.

## Reconnect

Automatic reconnect is triggered when the connection drops unexpectedly.

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

| Option            | Default      | Description                                                     |
| ----------------- | ------------ | --------------------------------------------------------------- |
| `attempts`        | `3`          | Max retry attempts. `<= 0` disables reconnect.                  |
| `delayMs`         | `1000`       | Base delay before the first retry.                              |
| `factor`          | `2`          | Exponential backoff multiplier.                                 |
| `maxDelayMs`      | `30000`      | Cap on the computed delay.                                      |
| `jitter`          | `0`          | Randomization factor (`0`–`1`).                                 |
| `shouldReconnect` | `() => true` | Predicate to decide whether a given close should trigger retry. |

Delay formula: `min(delayMs * factor^(attempt - 1), maxDelayMs)`, then jittered.

Reconnection is also configurable at the client level via `withWebSocketReconnect(...)` or `withWebSocketOptions({ reconnect: ... })`.

## Send Queue

Messages sent before the socket is `open` (or during a transient disconnect) are queued and flushed once the connection is ready.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| Option     | Description                                |
| ---------- | ------------------------------------------ |
| `maxSize`  | Max queued messages. Default is unbounded. |
| `overflow` | Behavior when `maxSize` is exceeded.       |

The queue is cleared on terminal close (`error`, `aborted`, `closed`).

## Manual Close and Abort Behavior

### `socket.close(code?, reason?)`

Performs a graceful close:

1. Calls the native `WebSocket.close(code, reason)`.
2. Aborts the internal `AbortController` with a `manual-web-socket-close` reason.
3. The session terminates as `closed`.
4. `socket.closed` resolves with the provided `code` and `reason`.

Because `session.close()` calls the native close before aborting the internal signal, consumers must not rely on observing a public `closing` state during manual close. The runtime may move directly to the terminal `closed` state from the perspective of `onStateChange` listeners.

### `AbortSignal` (external)

Pass an external `AbortSignal` via `execute()` options:

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// Later:
controller.abort() // if a current socket exists, it is closed; the final state is usually 'aborted'
```

When aborted **before** the socket opens, `execute()` resolves with a transport error and `socket` is `undefined`. When aborted **after** startup, external cancellation only drives `closing` if there is a current socket in `CONNECTING` or `OPEN`; during reconnect delay there may be no current socket to close, so the session finishes directly in a terminal state instead. The terminal state becomes `aborted` only when the merged abort reason normalizes to transport code `ABORTED` (for example the default `controller.abort()` reason, `ERR_ABORTED`, or a DOMException named `AbortError`); other custom reasons finish in `error`. Manual `socket.close()` still ends in `closed`, but it does not guarantee that `onStateChange` observers will see a public `closing` state first. In every case, `receive` ends.

### `timeout`

Request-level timeout is supported, but it cannot be combined with `abort` on the same request (a definition error is returned):

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// Error — cannot mix abort and timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## Complete Example

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setQueryParams({ token: input.query.token })
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

## What's Next

- [SSE →](/core/sse) — Server-Sent Events with typed structs and reconnect.
- [Client →](/core/client) — Client creation and WebSocket configuration.
- [Commands →](/core/commands) — `defineWebSocket` input and build rules.
