---
title: SSE
description: Define and decode Server-Sent Events, handle startup, consume the shared event queue, configure reconnect, and close owned streams.
---

# SSE

`defineEventStream(...)` creates an SSE command builder. An endpoint declares its path and the Struct used for each event name.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  path: '/notifications',
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

The method defaults to `GET`. An endpoint can set another method, but the high-level SSE build context does not support a request body.

## Event Decoding

The SSE parser selects `events[eventName]`, then `events.default` when present. Without either match, it drops the event and reports `missing-struct` to the optional invalid-event observer.

SSE `data:` arrives as text:

- `struct.string()`, `struct.text()`, `struct.any()`, and `struct.unknown()` receive text;
- `struct.number()` trims text and accepts a finite number;
- `struct.boolean()` trims text and accepts only `true` or `false`;
- `struct.json(inner)` parses JSON text, then structurally decodes it with `inner`.

A plain `struct.object(...)` does not parse JSON-looking event text. Wrap it with `struct.json(...)`.

A `default` Struct handles otherwise undeclared names:

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

Without a `default` Struct, `EventStreamData<TEvents>` is a discriminated union of the declared event names. Switching on `event.event` narrows `event.data` to the matching Struct output. When `default` is present, its branch retains the actual wire name as `event: string`; mixed known/default streams therefore keep that broad fallback.

## Input and Request Mapping

Use `struct.request(...)` for path, query, and header sections:

```typescript
const roomEvents = defineEventStream({
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

A custom SSE `build` can set path parameters, query parameters, and headers. It receives a schema-bound projection. It cannot set a body or credentials. Configure credentials with `withCredentials(...)` on the client.

## Startup Tuple

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

SSE returns:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

On success, the third item is the validated startup-open snapshot. Its response has passed HTTP status and `text/event-stream` content-type checks.

`stream.open` is a live getter. It holds the latest response seen by the logical stream, including a later reconnect response that subsequently fails status or content-type validation. Store `startupOpen` separately when the initial snapshot matters.

Do not log `startupOpen.url`, `stream.open.url`, or response URLs by default. They can contain sensitive path or query data.

## Consume Events

The owner should start iteration and arrange closure in the same lifecycle:

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

A successful `execute` means startup completed. Errors after startup appear through iterator rejection and `stream.closed`, not by changing the original tuple's `error` item.

## Invalid Events

Configure `onInvalidEvent` with `withSSEOnInvalidEvent(...)` or `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

The observer receives:

- `reason: 'missing-struct' | 'validation-failed'`;
- the raw event `id`, name, data text, and optional retry value;
- `cause` for validation failures.

The event is dropped. A later valid event can still be delivered. Observer throws and rejected promises are caught, but an async observer is awaited before later message processing continues. Keep it fast. Review and redact raw `id`, `data`, and `cause` before recording them.

## Reconnect

SSE has built-in retry behavior for network and stream-read failures. Normal EOF closes the stream with `code: 'eof'`; it does not reconnect.

By default, retry starts at 1 second and has no retry limit. Set `attempts` to bound it:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts` means retries after the initial attempt. `attempts: 0` disables retry. The `attempt` passed to `shouldReconnect` starts at 1 for the first retry and remains cumulative for the logical stream; a successful physical connection does not reset it.

Delay starts with the current retry interval. The server can update that interval with an SSE `retry:` field. `factor` applies exponential growth, and `maxDelayMs` caps that base. `jitter` then adds a random number of milliseconds from zero up to the configured value. Because jitter is added after the cap, the final delay can exceed `maxDelayMs` by less than `jitter`.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

The transport sends the latest event ID as `Last-Event-ID` on later attempts. Keep `shouldReconnect` non-throwing. A thrown or rejected predicate is not currently guaranteed to settle every pending iterator or `stream.closed` path.

HTTP/open validation failures, message-processing fatal errors, and normal EOF are not the same as a retriable network/read failure. Do not assume every terminal path reconnects.

## The Shared Work Queue

The async iterable is one shared work queue for the logical stream. It is not a subscription, broadcast, or backpressure mechanism.

By default the queue is unbounded. Configure a bound with `withSSEQueue(...)` or `withSSEOptions({ queue })`:

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | Behavior at the bound                                       |
| ------------- | ----------------------------------------------------------- |
| `drop-newest` | Discard the arriving event.                                 |
| `drop-oldest` | Remove the oldest buffered event, then enqueue the new one. |
| `error`       | Throw a queue overflow error and terminate processing.      |

Multiple iterators compete for values; they do not each receive a copy. Breaking one `for await` loop does not close the transport because the iterator has no lifecycle-aware `return()` implementation. Call `stream.close(...)` explicitly.

Closing marks the queue done but does not discard values already buffered. A consumer can drain those values before its next iteration reports `done: true`.

### Parser Buffer Limit

The event queue and parser buffer are separate. Set a positive `maxBufferSize` through `withSSEOptions(...)` to bound the bytes retained for an incomplete SSE line:

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

Exceeding that bound after startup rejects the iterator and closes the stream with `code: 'error'`. An omitted value leaves this parser buffer unbounded.

## Terminal Close

`stream.closed` resolves with:

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` means the response body ended normally.
- `aborted` includes an explicit `stream.close(...)` or cancellation path.
- `error` means retry stopped or a terminal stream error occurred.

`stream.close(reason)` is idempotent. It aborts active transport work, closes the queue for new pushes, and settles `stream.closed`. A `break` does none of those things.

The application boundary that opens the stream owns closing it. A client or framework provider does not close it automatically.

## Next

- [WebSocket](/core/web-socket) covers bidirectional sessions and opt-in reconnect.
- [Interceptors](/core/interceptors) covers SSE header changes and lifecycle observation.
- [Errors](/core/errors) explains startup response availability.
