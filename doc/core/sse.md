---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs uses `defineEventStream` to define typed SSE (Server-Sent Events) endpoints. After execution, a triplet `[error, stream, openInfo]` is returned, where `stream` is an async iterable for consuming server-pushed events one by one.

## Defining an Event Stream

When defining an SSE endpoint, declare the `events` field mapping event names to struct schemas. The `data` field of each event type is automatically parsed according to the matching schema.

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

### Default Event Schema (Fallback)

If the server may send event types not explicitly declared in `events`, provide a `default` schema as fallback. Without `default`, unknown events are silently discarded.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### Event Streams with Input

When a stream needs query parameters or request body, provide `input` schema and `build` function. The `build` signature is the same as `defineRequest`, supporting params, query, and headers.

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
  if (event.event === 'message') {
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

When the server sends an event that cannot match any schema in `events` (or `default`), or schema validation fails, the `onInvalidEvent` observer is triggered. It is a client-level configuration passed via `sse.onInvalidEvent` at `createClient` time.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-schema' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Original error when validation fails
    },
  },
})
```

`onInvalidEvent` is an **observer**:

- Even if it throws internally, the exception is silently ignored and the stream continues.
- It does not block subsequent events from being consumed.

## Reconnect and Queue Configuration

The SSE transport has built-in auto-reconnect, configurable via `sse.reconnect` and `sse.queue` at the client level.

### Reconnect Configuration

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
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
  },
})
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

| `overflow`    | Behavior                                               |
| ------------- | ------------------------------------------------------ |
| `drop-newest` | Discard newly arrived events, keep old events in queue |
| `drop-oldest` | Discard oldest events, make room for new events        |
| `error`       | Queue full throws error, causing stream close          |

## Complete Example

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

## What's Next

- [Client →](/core/client) — `createClient` and `sse` options
- [Commands →](/core/commands) — Command definitions and input rules
- [WebSocket →](/core/web-socket) — WebSocket connection and state management
