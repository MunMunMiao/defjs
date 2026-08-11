---
title: SSE
description: Define and decode bounded Server-Sent Events, configure reconnect, and close owned streams.
---

# SSE

`defineEventStream(...)` creates an SSE command builder. An endpoint declares its path and the Struct used for each event name.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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

For HTTP, SSE, and WebSocket execution, `timeout` must be a positive safe integer in `1..2_147_483_647`; `0`, negative or fractional values, `NaN`, `Infinity`, and values above the limit return `REQUEST_VALIDATION_FAILED` before any request, stream, or socket resource is created.

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
    await stream.closed
  }
}
```

A successful `execute` means startup completed. Errors after startup appear through iterator rejection and `stream.closed`, not by changing the original tuple's `error` item.

Leaving a `for await` loop early through `break`, `return`, or a thrown error calls the iterator's `return()` method. The stream closes automatically with `{ code: 'aborted', reason: 'iterator-return' }`; awaiting `stream.closed` observes that terminal state. Call `stream.close(...)` explicitly only when the owner must close the stream from outside active iteration.

## Invalid Events

Configure `onInvalidEvent` with `withSSEOnInvalidEvent(...)` or `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

The observer receives:

- `reason: 'missing-struct' | 'validation-failed'`;
- the raw event `id`, name, and data text;
- `cause` for validation failures.
- the active attempt `signal`.

The event is dropped. A later valid event can still be delivered. Observer throws and rejected promises are isolated, while abort interrupts a pending observer through `signal`. Keep it fast. Review and redact raw `id`, `data`, and `cause` before recording them.

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

The transport sends the latest event ID as `Last-Event-ID` on later attempts. If `shouldReconnect` throws or rejects, retry stops and the pending startup or stream settles with that policy error. Abort interrupts a pending predicate through the active attempt signal.

HTTP/open validation failures, message-processing fatal errors, and normal EOF are not the same as a retriable network/read failure. Do not assume every terminal path reconnects.

## Endpoint-Owned Limits

A stream has exactly one async-iterator consumer. Creating a second iterator throws. Returning from the iterator, including an early `break` from `for await`, automatically closes the stream with reason `iterator-return`.

Every definition requires positive safe-integer `maxBufferSize` and `maxQueueSize`. The buffer limit applies to each SSE line and the current event data, while the queue limit bounds parsed events waiting for the consumer. Queue overflow is fatal and never silently drops an event.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

Normal EOF lets the consumer drain buffered events. A fatal parser, transform, or overflow error clears buffered events, cancels the active body, rejects iteration, and settles `stream.closed` with `code: 'error'`.

## Terminal Close

`stream.closed` resolves with a discriminated union:

```typescript
type EventStreamCloseInfo =
  | { code: 'eof'; reason?: string; cause?: unknown }
  | { code: 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

- `eof` means the response body ended normally.
- `aborted` includes an explicit `stream.close(...)` or cancellation path.
- `error` means retry stopped or a terminal stream error occurred. This branch always includes a public `errorCode`.

`EventStreamErrorCode` has six stable values:

| Error code                  | Meaning                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `INVALID_RESPONSE`          | Status, content type, response error, or response body was invalid.      |
| `MESSAGE_PROCESSING_FAILED` | Event transformation or a lifecycle callback failed.                     |
| `PARSER_LIMIT_EXCEEDED`     | An endpoint-owned parser buffer limit was exceeded.                      |
| `QUEUE_OVERFLOW`            | Parsed events exceeded the endpoint-owned queue bound.                   |
| `TIMEOUT`                   | The transport attempt reached its configured timeout.                    |
| `TRANSPORT_ERROR`           | Another terminal network, stream-read, or retry-policy failure occurred. |

`stream.close(reason)` is idempotent. It aborts active transport work, closes the queue for new pushes, and settles `stream.closed`. Iterator `return()` uses that same close path with reason `iterator-return`.

Routine logs should record only `close.code` and, for the `error` branch, `close.errorCode`. Do not log `reason`, `cause`, raw events, or stream URLs without an explicit redaction and retention policy.

The application boundary that opens the stream owns closing it. A client or framework provider does not close it automatically.

## Next

- [WebSocket](./web-socket.md) covers bidirectional sessions and opt-in reconnect.
- [Interceptors](./interceptors.md) covers SSE header changes and lifecycle observation.
- [Errors](./errors.md) explains startup response availability.
