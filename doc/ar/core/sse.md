---
title: Server-Sent Events
description: استهلك تدفق SSE مُنوَّعًا، أغلقه، وانتظر وعد closed النهائي.
---

# Server-Sent Events

افتح تدفقًا، كرّر مرة واحدة، ثم `close` و`await stream.closed`. أنت تملك دورة الحياة تلك — العملاء والإضافات لا يتخلصون منها نيابةً عنك.

## الإعداد الأساسي

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, openedStream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using stream = openedStream
  for await (const event of stream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## عرّف التدفق

`defineEventStream(...)` يحتاج `events` و`maxBufferSize` عددًا صحيحًا آمنًا موجبًا و`maxQueueSize` عددًا صحيحًا آمنًا موجبًا و`path` نسبيًا. الطريقة الافتراضية `GET`.

مدخل الطلب قد يملك `path` و`query` و`headers` — لا `body`. `build` المخصص يحصل على معيّنات path/query/header فقط. Defjs ترسل `Accept: text/event-stream` عندما لم تضبط `Accept` بالفعل.

تدفق منطقي واحد يمكن أن يمتد عبر عدة محاولات Fetch مادية. SSE تعيد محاولة أعطال الشبكة وقراءة التدفق العابرة افتراضيًا حتى بلا خيارات إعادة اتصال؛ بلا حد `attempts` تلك المحاولات بلا حدود. ما زلت تحصل على معالج واحد ومكرّر غير متزامن واحد.

## افتح وافحص

`client.execute(...)` يُحل فقط بعد نجاح فحوص الحالة ونوع المحتوى والجسم:

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

يجب أن تكون الاستجابة ناجحة، وجوهر نوع الوسائط `text/event-stream`، ولها جسم. بدء غير-2xx → `HTTP_STATUS`. نوع محتوى سيئ أو جسم مفقود → `RESPONSE_VALIDATION_FAILED`. لقطة استجابة يمكن أن تبقى في الخانة الثالثة من الـ tuple عندما يفشل التحقق بعد وصول الاستجابة.

`startupOpen` هي اللقطة الأولية. `stream.open` حي ويتغيّر عند الفتحات المادية اللاحقة. احتفظ بقيمة الـ tuple عندما تهم الاستجابة الأولى.

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## فكك الأحداث

اسم الحدث على السلك → `events[eventName]`؛ وإلا `events.default`. بلا Struct مطابق → الحدث لا يُسلَّم. حقل SSE `event` المفقود → الاسم المنطقي `message`.

`data` في SSE يبدأ كنص. Struct المختار يقرر التحويل:

| Struct                                                                 | التحويل                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `struct.string()`، `struct.text()`، `struct.any()`، `struct.unknown()` | يبقى نصًا                                                    |
| `struct.number()`                                                      | النص المقصوص يجب أن يكون عددًا محدودًا؛ الفارغ غير صالح      |
| `struct.boolean()`                                                     | النص المقصوص بالضبط `true` أو `false`                        |
| `struct.json(inner)`                                                   | حلّل JSON، ثم فكك بـ `inner`                                 |
| كائن، مصفوفة، اتحاد، Structs عادية أخرى                                | فكك النص مباشرة؛ النص الشبيه بـ JSON **لا** يُحلَّل تلقائيًا |

القيمة المُصدَرة: `event`، و`data` مفكوك، و`id` اختياري غير فارغ. مع `default`، أسماء الأحداث المجهولة هي `string` في الاتحاد المستنتج.

## راقب الأحداث غير الصالحة

الأحداث غير الصالحة/غير المعلَنة تُسقط، لا تُصفّ. `withSSEOnInvalidEvent(...)` يمكن أن يراقب المعرّف الخام والاسم وبيانات النص، مع `missing-struct` أو `validation-failed` وسبب اختياري.

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

المراقب يعمل عند حد التحويل. فشله معزول ما لم يُجهض إشارة المحاولة النشطة. أبقِه قصيرًا؛ لا تعامل بيانات الحدث الخام كموثوقة.

## أعد الاتصال

إعدادات إعادة الاتصال تخصّص مسار إعادة المحاولة الافتراضي — ليست مطلوبة لتفعيل المحاولات. EOF العادي لا يُعاد. أعطال الشبكة وقراءة التدفق يمكن أن تُعاد. تحقق الحالة/نوع المحتوى وحدود المحلّل وأعطال تحويل الرسالة وفيضان الطابور وEOF العادي نهائية للتدفق المنطقي.

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts` يعدّ المحاولات بعد المحاولة الأولية؛ `attempts: 0` يعطّل إعادة المحاولة. بلا حد محاولات → محاولات مدمجة بلا حدود. `delayMs` هو الفاصل الأولي؛ `factor` يكبره؛ `maxDelayMs` يحد الأساس. `jitter` في SSE هو **عامل ضربي 0–1**، مثل WebSocket. حقل تدفق `retry:` يحدّث الفاصل الحالي. ردّ callback السياسة بـ false / رمي / رفض ينهي التدفق المنطقي.

أحدث معرّف حدث محلَّل يصبح `Last-Event-ID` في محاولة لاحقة. اعرف دلالات إعادة التشغيل على الخادم قبل إعادة اتصال بلا حدود.

## حدود المخزن والطابور

كلاهما يجب أن يكونا أعدادًا صحيحة آمنة موجبة. الفيضان قاتل — بلا إسقاط صامت لأحداث أقدم.

| الحد            | يحمي                                      | الرمز النهائي           |
| --------------- | ----------------------------------------- | ----------------------- |
| `maxBufferSize` | سطر/حدث SSE غير مكتمل/مفرط أثناء التحليل  | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | أحداث تُنتج أسرع مما يقرأ المستهلك الواحد | `QUEUE_OVERFLOW`        |

التدفق القاتل أيضًا يمسح الأحداث المخزّنة، ويلغي الجسم النشط، ويرفض المكرّر، ويحل `stream.closed` بـ `code: 'error'`.

## أغلق وانتظر

`EventStreamHandle`: لقطة فتح حية واحدة، وعد نهائي واحد، `close` واحد، مكرّر غير متزامن واحد.

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

type StreamApi<T> = {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
  [Symbol.asyncIterator](): AsyncIterator<T>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

الرموز النهائية: `eof` أو `aborted` أو `error`. نتيجة `error` تحمل أيضًا `EventStreamErrorCode`: `INVALID_RESPONSE` أو `MESSAGE_PROCESSING_FAILED` أو `PARSER_LIMIT_EXCEEDED` أو `QUEUE_OVERFLOW` أو `TIMEOUT` أو `TRANSPORT_ERROR`.

`close(reason)` يجهض المحاولة النشطة، ويغلق الطابور، ويستقر كـ `aborted`. `break` / `return` / رمي في الحلقة يستدعي إرجاع المكرّر ويغلق بـ `iterator-return`. الكود الذي ينفّذ الأمر يملك الإغلاق.

`await using` يستدعي نفس lifecycle المملوك. يضمن انتهاء قراءة Defjs وإعادة الاتصال وتحرير reader lock؛ ولا يضمن اكتمال `ReadableStream.cancel()` Promise عالق عند المزوّد. يبقى `close()` و`closed` متاحين. يجب أن تضيف تطبيقات `EventStreamHandle` الهيكلية المخصصة نفس disposer؛ أما الكود الذي يستقبل handle من Defjs فقط فلا يُطلب منه استدعاء runtime إضافي.

العقد الأدنى المدعوم والمتحقق منه للمكتبات هو `ES2022` و`ESNext.Disposable` و`DOM` و`DOM.Iterable` مع TypeScript 7 المثبّت في المستودع. هذه المجموعة هي baseline واحدة؛ لا يعني ذلك أن كل declaration يفرض كل عنصر مستقلًا، ولا يوجد وعد لمترجمات أقدم غير مختبرة. عميل HTTP العادي ليس `AsyncDisposable`؛ أدر الطلبات بـ timeout أو `AbortSignal`.

أبقِ بيانات الاعتماد وبيانات الأحداث ومعرّفات الأحداث والأسباب وعناوين URL للتدفق خارج السجلات الروتينية. `withCredentials(true)` يؤثر على ملفات تعريف ارتباط Fetch لـ SSE؛ لا يضبط مصادقة WebSocket.

## وصفات ذات صلة

- [استهلاك تدفق SSE](../recipes/consume-sse.md)
- [إلغاء استدعاء HTTP](../recipes/cancel-http.md)
