---
title: SSE
description: defineEventStream、execute options，同 stream handle。
---

# SSE

Declare 一條 event stream，execute 佢，iterate events，之後 close。

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`、`events` map，optional `method`（default `'GET'`）、`input`、`build`、buffer/queue limits。
- **Returns** 一個 builder。Call 再傳 input，就會得到 `EventStreamCommand`。

```ts
import { defineEventStream, struct } from '@defjs/core'

const ticks = defineEventStream({
  path: '/ticks',
  events: { message: struct.object({ text: struct.string() }) },
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

`client.execute` 嘅 low-level entry。Application code prefer 用 client。

- **Returns** `[null, stream, open]` 或者 `[error, undefined, open?]`。

## Execute options

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Cancellation 規則同 HTTP 一樣：`abort` 或者 `timeout`，唔可以兩個一齊。

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` 係 startup snapshot；reconnect 之後可以變 — 亦都要讀 `stream.open`。自己 own 嘅 scope 優先用 `await using stream = handle` cleanup。Disposer 會停低 Defjs 嘅 read 同 reconnect work，再等 reader lock release；但唔保證由 provider 控制兼卡死咗嘅 `ReadableStream.cancel()` promise 一定完成。Manual `close()` / `closed` 仍然用得。

```ts
async function consume(handle: EventStreamHandle<unknown>): Promise<void> {
  await using stream = handle
  for await (const event of stream) console.log(event)
}
```

自己 structural implement `EventStreamHandle` 嘅 code，而家必須 implement `[Symbol.asyncDispose]()`，並 return 同一條 owned teardown path。對 custom handle implementer 嚟講係 compile-time breaking change；淨係接收 Defjs handle 嘅 code 唔使加新 runtime call。

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

`EventStreamErrorCode`：`'INVALID_RESPONSE' | 'MESSAGE_PROCESSING_FAILED' | 'PARSER_LIMIT_EXCEEDED' | 'QUEUE_OVERFLOW' | 'TIMEOUT' | 'TRANSPORT_ERROR'`。

## Event map

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

睇 [SSE guide](../core/sse.md) 同 [Consume an SSE stream](../recipes/consume-sse.md)。

## EventStreamDefinition {#EventStreamDefinition}

`path`、`events`，optional `method` / `input` / `build`，仲有 buffer 同 queue 上限。

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

`defineEventStream` 嘅回傳。用 input call 一次就攞到 `EventStreamCommand`。

## EventStreamCommand {#EventStreamCommand}

Opaque SSE command。交畀 `client.execute`。

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

由 `EventStructs` map infer 出嚟、parse 完嘅 event payload。
