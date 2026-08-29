---
title: SSE
description: defineEventStream, Execute-Options und das Stream-Handle.
---

# SSE

Deklariere einen Event-Stream, führe ihn aus, iteriere Events, dann schließe.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`, `events`-Map, optionales `method` (Default `'GET'`), `input`, `build`, Buffer-/Queue-Limits.
- **Returns** einen Builder. Ruf ihn mit Input auf und du bekommst einen `EventStreamCommand`.

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

Low-Level-Einstieg für `client.execute`. Im Application-Code lieber den Client nutzen.

- **Returns** `[null, stream, open]` oder `[error, undefined, open?]`.

## Execute-Optionen

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Dieselben Cancellation-Regeln wie HTTP: `abort` oder `timeout`, nicht beides.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` ist der Startup-Snapshot; nach Reconnect kann er wechseln — lies auch `stream.open`. Nutze `await using` für owned Cleanup. `close()` und `closed` bleiben für manuelle Steuerung verfügbar.

Der Disposer wartet, bis Defjs-Lese- und Reconnect-Schleifen gestoppt sind und der Reader-Lock freigegeben ist. Er garantiert nicht, dass ein beim Provider hängendes `ReadableStream.cancel()`-Promise beendet ist. Jede strukturelle eigene `EventStreamHandle`-Implementierung muss dasselbe `[Symbol.asyncDispose]()` ergänzen; das ist eine Compile-Time-Breaking-Änderung.

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

## Event-Map

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

Siehe [SSE-Guide](../core/sse.md) und [SSE-Stream konsumieren](../recipes/consume-sse.md).

## EventStreamDefinition {#EventStreamDefinition}

`path`, `events`, optional `method` / `input` / `build`, plus Buffer- und Queue-Limits.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

Kommt von `defineEventStream`. Mit Input aufrufen → `EventStreamCommand`.

## EventStreamCommand {#EventStreamCommand}

Opakes SSE-Command. Gib es `client.execute`.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

Geparstes Event-Payload, inferiert aus einer `EventStructs`-Map.
