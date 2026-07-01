---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs uses `defineEventStream` to define typed SSE (Server-Sent Events) endpoints. After execution, a triplet `[error, stream, openInfo]` is returned, where `stream` is an async iterable for consuming server-pushed events one by one.

## Defining an Event Stream

When defining an SSE endpoint, declare the `events` field mapping event names to structs. The SSE transport delivers each `data:` payload as raw text; Defjs selects the matching struct and decodes the text according to that struct's content kind.

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

### Default Event Struct

If the server may send event types not explicitly declared in `events`, provide a `default` struct. Without `default`, unknown events are silently discarded.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### Event Data Content Decoding

SSE transport delivers each `data:` payload as text. Defjs first selects the event struct from `events[eventName] ?? events.default`, then decodes the text according to that selected struct.

Use `struct.json(inner)` when the server sends JSON text for an event. `struct.json(inner)` first runs `JSON.parse` on the raw SSE text, then parses the resulting value with `inner`:

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

For primitive text payloads:

- `struct.string()` and `struct.text()` read the raw event text.
- `struct.number()` trims the text and accepts only finite numeric values.
- `struct.boolean()` trims the text and accepts only exact `true` or `false`.

Plain `struct.object(...)`, `struct.array(...)`, and `struct.record(...)` do not parse JSON-looking text by themselves. Wrap them in `struct.json(...)` for JSON event data.

### Event Streams with Input

When a stream needs query parameters or request body, provide `input` struct and `build` function. The `build` signature is the same as `defineRequest`, supporting params, query, and headers.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## Execution Result

`client.execute()` returns a triplet for SSE commands:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — Non-null on connection or validation failure; `null` on success.
- **`stream`** — On success, an `EventStreamHandle` consumable via `for await...of`; `undefined` on failure.
- **`open`** — Contains first-connection response info (`response` and `url`). May be `undefined` on connection failure.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle and stream.closed

`EventStreamHandle` implements `AsyncIterable`, so it can be directly used with `for await...of`. It also provides these properties:

| Property / Method          | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `open`                     | First connection `EventStreamOpenInfo` (contains `response` and `url`)    |
| `closed`                   | `Promise<EventStreamCloseInfo>`, resolves when the stream is fully closed |
| `close(reason?)`           | Actively close the stream, optionally passing a reason                    |
| `[Symbol.asyncIterator]()` | Returns an async iterator consuming the event queue                       |

`closed` resolves when:

- Server normal end (`code: 'eof'`)
- Active close via `stream.close()` (`code: 'aborted'`)
- Connection error or reconnect exhaustion (`code: 'error'`)

```typescript
// Active close
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## Invalid Event Handling: onInvalidEvent

When the server sends an event that cannot match any struct in `events` (or `default`), or struct validation fails, the `onInvalidEvent` observer is triggered. It is a client-level configuration passed via `sse.onInvalidEvent` at `createClient` time.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Original error when validation fails
    },
  }),
)
```

`onInvalidEvent` is an **observer**:

A common validation failure is declaring `struct.object(...)` for an event whose `data:` field is JSON text. Declare `struct.json(struct.object(...))` instead. Invalid JSON under `struct.json(...)` is reported as `validation-failed` and is not retried as raw text.

- Even if it throws internally, the exception is silently ignored and the stream continues.
- It does not block subsequent events from being consumed.

## Reconnect and Queue Configuration

The SSE transport has built-in auto-reconnect, configurable via `sse.reconnect` and `sse.queue` at the client level.

### Reconnect Configuration

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // Max retry attempts
      delayMs: 1000, // Initial retry interval
      factor: 2, // Exponential backoff multiplier
      maxDelayMs: 30000, // Max retry interval
      jitter: 1000, // Random jitter range (ms)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

Reconnect priority:

1. If `onerror` returns `null`, stop reconnecting.
2. If `shouldReconnect` returns `false`, stop reconnecting.
3. If `attempts` limit exceeded, stop reconnecting.
4. Otherwise, compute next retry interval using `delayMs` + `factor` exponential backoff + `jitter`.

> Reconnect automatically carries the `Last-Event-ID` header so the server can resume from the breakpoint.

### Queue Configuration

Events enter an internal async queue after arrival, then are consumed by the iterator. You can limit queue size and overflow behavior:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | Behavior                                               |
| ------------- | ------------------------------------------------------ |
| `drop-newest` | Discard newly arrived events, keep old events in queue |
| `drop-oldest` | Discard oldest events, make room for new events        |
| `error`       | Queue full throws error, causing stream close          |

## Complete Example

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
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
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## What's Next

- [Client →](/core/client) — `createClient` and `sse` options
- [Commands →](/core/commands) — Command definitions and input rules
- [WebSocket →](/core/web-socket) — WebSocket connection and state management
