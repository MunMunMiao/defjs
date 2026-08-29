---
title: SSE
description: defineEventStream, опции execute и stream handle.
---

# SSE

Объяви event stream, выполни, итерируй события, потом закрой.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`, карта `events`, опциональный `method` (по умолчанию `'GET'`), `input`, `build`, лимиты buffer/queue.
- **Возвращает** builder. Вызови с input — получишь `EventStreamCommand`.

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

Это то, чем пользуется `client.execute`. В приложении бери клиент.

- **Возвращает** `[null, stream, open]` или `[error, undefined, open?]`.

## Опции execute

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Те же правила отмены, что у HTTP: `abort` или `timeout`, не оба.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` — снимок старта; после reconnect он может смениться — читай ещё `stream.open`. Для cleanup принадлежащей области предпочитай `await using stream = handle`. Disposer останавливает чтение и reconnect-работу Defjs и ждёт освобождения reader lock; он не обещает завершения зависшего `ReadableStream.cancel()`, которым управляет provider. Ручные `close()` / `closed` остаются доступны.

```ts
async function consume(handle: EventStreamHandle<unknown>): Promise<void> {
  await using stream = handle
  for await (const event of stream) console.log(event)
}
```

Структурные реализации `EventStreamHandle` теперь обязаны реализовать `[Symbol.asyncDispose]()` и возвращать тот же путь owned teardown. Для авторов custom handle это compile-time breaking change; код, который только получает handle от Defjs, не обязан добавлять новый runtime-вызов.

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

## Карта событий

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

Подробности — в [гайде SSE](../core/sse.md) и [Читать SSE](../recipes/consume-sse.md).

## EventStreamDefinition {#EventStreamDefinition}

`path`, `events`, опционально `method` / `input` / `build`, плюс лимиты buffer и queue.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

Возвращает `defineEventStream`. Вызови с input — получишь `EventStreamCommand`.

## EventStreamCommand {#EventStreamCommand}

Непрозрачная SSE command. Отдавай в `client.execute`.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

Разобранный payload события, выведенный из map `EventStructs`.
