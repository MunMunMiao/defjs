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

If the server may send event types not explicitly declared in `events`, provide a `default` struct. Without `default`, unknown events are discarded from the stream. If `onInvalidEvent` is configured, they are still observable there with reason `missing-struct`.

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

When a stream needs path parameters, query parameters, or headers, provide an `input` struct. If that input uses `struct.request({ path, query, headers })`, Defjs maps those sections automatically. Add `build` only when the public input shape differs from the wire shape.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

SSE `build` only supports mapping path, query, and header request parts. Configure credentials at the client level with `withCredentials(...)`; `build(ctx, input)` does not expose a public credentials setter. SSE `build` also does not expose request-body mapping.

## Execution Result

`client.execute()` returns a triplet for SSE commands:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — Non-null only when the connection or startup fails, or when request input validation fails during `client.execute()` startup. It is `null` once the stream opens successfully. Event-level `validation-failed` / `missing-struct` cases do not populate this `error`; they are reported through `onInvalidEvent`, the invalid event is dropped from the stream, and the stream can continue.
- **`stream`** — On success, an `EventStreamHandle` consumable via `for await...of`; `undefined` on failure.
- **`open`** — The startup open snapshot returned when `client.execute()` successfully completes startup, containing the validated startup response info (`response` and `url`). If reconnects happen later, read `stream.open` for the handle's latest open-response / latest connection-attempt response snapshot; it updates as soon as a response is received, so it is not guaranteed to represent a successful connection or a response that passed later validation, and a reconnect response such as HTTP 4xx/5xx or an invalid `content-type` can overwrite it. If you need to keep the startup snapshot from `client.execute()`, store this third tuple item separately. May be `undefined` on connection failure or startup-time validation failure.

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

`EventStreamHandle` implements `AsyncIterable`, so it can be directly used with `for await...of`. It also provides these properties. Note that `stream.open` is live handle state updated on every newly received open response: it is the latest open-response / latest connection-attempt response snapshot, not a guarantee of a successful connection or of having passed later validation. By contrast, `const [error, stream, open] = await client.execute(...)` returns a startup snapshot in its third tuple item; store that separately if you need to keep it.

| Property / Method          | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `open`                     | Latest open-response / latest connection-attempt `EventStreamOpenInfo` (contains `response` and `url`); updates on every new open response, including reconnect responses that may fail later validation |
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

When the server sends an event that cannot match any struct in `events` (or `default`), or struct validation fails, the `onInvalidEvent` observer is triggered. Configure it with `withSSEOptions({ onInvalidEvent })` or `withSSEOnInvalidEvent(...)` at `createClient` time.

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

- It receives `reason: 'missing-struct' | 'validation-failed'` plus the raw `message` context, so you can log, alert, or collect metrics from invalid events.
- The invalid event is dropped and is not yielded through `stream`; later valid events can still be consumed.
- Even if it throws internally, the exception is silently ignored and does not interrupt the stream.
- However, if `onInvalidEvent` is async, runtime awaits it for that invalid event before continuing later message processing, so slow handlers can delay subsequent event delivery to consumers.
- Keep handlers lightweight; for slow logging, reporting, or other background work, fire-and-forget that work inside the handler.

A common validation failure is declaring `struct.object(...)` for an event whose `data:` field is JSON text. Declare `struct.json(struct.object(...))` instead. Invalid JSON under `struct.json(...)` is reported as `validation-failed` and is not retried as raw text.

## Reconnect and Queue Configuration

The SSE transport has built-in auto-reconnect. Configure it at the client level with `withSSEReconnect(...)`, `withSSEQueue(...)`, or `withSSEOptions(...)`.

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

Reconnect decision flow:

1. If `shouldReconnect` returns `false`, stop reconnecting.
2. If `attempts` limit exceeded, stop reconnecting.
3. Otherwise, compute the next retry interval using `delayMs` + `factor` exponential backoff + `jitter`.

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
