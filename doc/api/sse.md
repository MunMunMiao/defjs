---
title: SSE
description: defineEventStream, execute options, and the stream handle.
---

# SSE

Declare an event stream, execute it, iterate events, then close.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`, `events` map, optional `method` (default `'GET'`), `input`, `build`, buffer/queue limits.
- **Returns** a builder. Call with input to get an `EventStreamCommand`.

```ts
import { defineEventStream, struct } from '@defjs/core'

const ticks = defineEventStream({
  path: '/ticks',
  events: { message: struct.json(struct.object({ text: struct.string() })) },
})
```

## executeEventStreamCommand() {#executeEventStreamCommand}

```ts
function executeEventStreamCommand(
  clientConfig: ClientConfig,
  command: EventStreamCommand,
  options?: EventStreamExecuteOptions,
): Promise<StreamAwaitResult>
```

Low-level entry for `client.execute`. Prefer the client in application code.

- **Returns** `[null, stream, open]` or `[error, undefined, open?]`.

## Execute options

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Same cancellation rules as HTTP: `abort` or `timeout`, not both.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` is the startup snapshot; after reconnect it can change — also read `stream.open`. Prefer `await using stream = handle` for owned scope cleanup. The disposer stops Defjs reading and reconnect work and waits for its reader lock to be released; it does not promise that a provider-controlled, stuck `ReadableStream.cancel()` promise will finish. Manual `close()` / `closed` remains available.

```ts
async function consume(handle: EventStreamHandle<unknown>): Promise<void> {
  await using stream = handle
  for await (const event of stream) console.log(event)
}
```

Structural implementations of `EventStreamHandle` must now implement `[Symbol.asyncDispose]()` and return the same owned teardown path. This is a compile-time breaking change for custom handles; code that only receives handles returned by Defjs has no new runtime call requirement.

### EventStreamOpenInfo {#EventStreamOpenInfo}

```ts
interface EventStreamOpenInfo {
  response: HttpResponse<unknown>
  url: string
}
```

### EventStreamCloseInfo {#EventStreamCloseInfo}

```ts
type EventStreamCloseInfo =
  | { code: 'eof' | 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

`EventStreamErrorCode`: `'INVALID_RESPONSE' | 'MESSAGE_PROCESSING_FAILED' | 'PARSER_LIMIT_EXCEEDED' | 'QUEUE_OVERFLOW' | 'TIMEOUT' | 'TRANSPORT_ERROR'`.

## Event map

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

JSON event payloads need `struct.json(...)`. Plain `struct.object` treats SSE `data` as text and drops JSON frames.

Reconnect lives on the client (`withSSEReconnect`). SSE `jitter` is a **0–1 multiplicative factor**, same as WebSocket.

See [SSE guide](/core/sse) and [Consume an SSE stream](/recipes/consume-sse).

## EventStreamDefinition {#EventStreamDefinition}

`path`, `events`, optional `method` / `input` / `build`, buffer and queue limits.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

Returned by `defineEventStream`. Call with input to get an `EventStreamCommand`.

## EventStreamCommand {#EventStreamCommand}

Opaque SSE command. Pass to `client.execute`.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

Parsed event payload inferred from an `EventStructs` map.
