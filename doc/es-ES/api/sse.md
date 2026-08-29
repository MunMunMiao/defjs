---
title: SSE
description: defineEventStream, opciones de execute y el handle del stream.
---

# SSE

Declara un event stream, ejecútalo, itera los eventos y luego cierra.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`, mapa `events`, `method` opcional (por defecto `'GET'`), `input`, `build`, límites de buffer/cola.
- **Devuelve** un builder. Llámalo con el input para obtener un `EventStreamCommand`.

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

Entrada de bajo nivel para `client.execute`. En la app prefiere el cliente.

- **Devuelve** `[null, stream, open]` o `[error, undefined, open?]`.

## Options de execute

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Las mismas reglas de cancelación que HTTP: `abort` o `timeout`, no ambos.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` es el snapshot de arranque; tras reconnect puede cambiar — lee también `stream.open`. Usa `await using` para el cleanup propietario. `close()` y `closed` siguen disponibles para control manual.

El disposer espera a que se detengan los bucles de lectura/reconexión de Defjs y se libere el reader lock. No garantiza que termine una Promise de `ReadableStream.cancel()` atascada en el proveedor. Toda implementación estructural propia de `EventStreamHandle` debe añadir el mismo `[Symbol.asyncDispose]()`; es un cambio breaking en compilación.

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

## Mapa de eventos

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

Ver [guía de SSE](../core/sse.md) y [Consumir un stream SSE](../recipes/consume-sse.md).

## EventStreamDefinition {#EventStreamDefinition}

`path`, `events`, `method` / `input` / `build` opcionales, y techos de buffer y queue.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

Lo devuelve `defineEventStream`. Llámalo con input y sale un `EventStreamCommand`.

## EventStreamCommand {#EventStreamCommand}

Command SSE opaco. Pásaselo a `client.execute`.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

Payload de evento parseado, inferido de un map `EventStructs`.
