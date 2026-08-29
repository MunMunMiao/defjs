---
title: SSE
description: defineEventStream، خيارات التنفيذ، ومقبض التدفق.
---

# SSE

أعلن تدفق أحداث، نفّذه، كرّر الأحداث، ثم أغلق.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`، خريطة `events`، `method` اختياري (الافتراضي `'GET'`)، `input`، `build`، حدود المخزن/الطابور.
- **يُرجع** منشئًا. استدعِه بالمدخل لتحصل على `EventStreamCommand`.

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

مدخل منخفض المستوى لـ `client.execute`. فضّل العميل في شيفرة التطبيق.

- **يُرجع** `[null, stream, open]` أو `[error, undefined, open?]`.

## خيارات التنفيذ

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

نفس قواعد إلغاء HTTP: `abort` أو `timeout`، لا كلاهما.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` هي لقطة البدء؛ بعد إعادة الاتصال يمكن أن تتغيّر — اقرأ أيضًا `stream.open`. استخدم `await using` للتنظيف المملوك. يبقى `close()` و`closed` متاحين للتحكم اليدوي.

ينتظر disposer توقف قراءة Defjs وحلقة إعادة الاتصال وتحرير reader lock. لا يضمن اكتمال `ReadableStream.cancel()` Promise عالق عند المزوّد. أي تنفيذ هيكلي مخصص لـ `EventStreamHandle` يجب أن يضيف نفس `[Symbol.asyncDispose]()`؛ وهذا تغيير كسر وقت الترجمة.

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

## خريطة الأحداث

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

انظر [دليل SSE](../core/sse.md) و[استهلاك تدفق SSE](../recipes/consume-sse.md).

## EventStreamDefinition {#EventStreamDefinition}

`path` و`events` و`method` / `input` / `build` اختيارية، مع حدود المخزن والطابور.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

يعيده `defineEventStream`. استدعه بالمدخل لتحصل على `EventStreamCommand`.

## EventStreamCommand {#EventStreamCommand}

أمر SSE معتم. مرّره إلى `client.execute`.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

حمولة الحدث المحللة المستنتجة من خريطة `EventStructs`.
