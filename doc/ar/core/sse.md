---
title: SSE
description: عرّف Server-Sent Events وفك ترميزها، وتعامل مع البدء، واستهلك event queue المشتركة، واضبط reconnect، وأغلق streams التي تملكها.
---

# SSE

تنشئ `defineEventStream(...)` منشئ أمر SSE. تعلن نقطة النهاية path والـ Struct المستخدم لكل اسم event.

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

الـ method الافتراضي هو `GET`. تستطيع نقطة النهاية ضبط method آخر، لكن سياق build عالي المستوى في SSE لا يدعم request body.

## فك ترميز الأحداث

يختار SSE parser القيمة `events[eventName]` ثم `events.default` عند وجودها. إذا لم يجد أيًا منهما، يسقط event ويبلغ المراقب الاختياري للأحداث غير الصالحة بسبب `missing-struct`.

تصل قيمة SSE في `data:` كنص:

- تستقبل `struct.string()` و`struct.text()` و`struct.any()` و`struct.unknown()` النص؛
- تحذف `struct.number()` المسافات وتقبل عددًا finite؛
- تحذف `struct.boolean()` المسافات ولا تقبل إلا `true` أو `false`؛
- تفك `struct.json(inner)` نص JSON ثم تجري عليه فك ترميز بنيويًا باستخدام `inner`.

لا يفك `struct.object(...)` عادي نص event الذي يبدو كـ JSON. غلّفه بـ `struct.json(...)`.

يتعامل Struct باسم `default` مع الأسماء غير المعلنة:

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

من دون Struct باسم `default`، يكون `EventStreamData<TEvents>` اتحادًا تمييزيًا لأسماء الأحداث المعلنة. يؤدي التفريع بحسب `event.event` إلى تضييق `event.data` إلى ناتج الـ Struct المطابق. عند وجود `default`، يحتفظ فرعه باسم الحدث الفعلي على wire بوصفه `event: string`؛ لذلك تحتفظ الـ streams التي تجمع بين أسماء أحداث معروفة و`default` بذلك الفرع الاحتياطي الواسع.

## Input وربط الطلب

استخدم `struct.request(...)` لأقسام path وquery وheaders:

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

يستطيع `build` مخصص لـ SSE ضبط path parameters وquery parameters وheaders. وهو يستقبل إسقاطًا مرتبطًا بالـ Struct. ولا يستطيع ضبط body أو credentials. اضبط credentials على العميل باستخدام `withCredentials(...)`.

## Tuple البدء

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

يعيد SSE:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

عند النجاح يكون العنصر الثالث لقطة فتح تم التحقق منها عند البدء. تكون response الخاصة بها قد اجتازت فحص HTTP status و`text/event-stream` content type.

أما `stream.open` فهو getter حي. يحتفظ بأحدث response رآها stream المنطقي، بما في ذلك response من reconnect لاحق تفشل بعد ذلك في التحقق من status أو content type. خزّن `startupOpen` منفصلة عندما تكون اللقطة الأولى مهمة.

لا تسجّل `startupOpen.url` أو `stream.open.url` أو response URLs افتراضيًا. قد تحتوي على بيانات حساسة في path أو query.

## استهلاك الأحداث

ينبغي للمالك بدء التكرار وترتيب الإغلاق ضمن دورة الحياة نفسها:

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

يعني نجاح `execute` أن البدء اكتمل. تظهر الأخطاء التي تقع بعد البدء عبر رفض iterator و`stream.closed`، لا بتغيير عنصر `error` في الـ tuple الأصلي.

## الأحداث غير الصالحة

اضبط `onInvalidEvent` باستخدام `withSSEOnInvalidEvent(...)` أو `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

يستقبل المراقب:

- `reason: 'missing-struct' | 'validation-failed'`؛
- قيمة `id` الخام واسم event ونص data وقيمة retry الاختيارية؛
- `cause` عند فشل التحقق.

يُسقط event، ويمكن مع ذلك تسليم event صالح لاحقًا. تُلتقط أخطاء المراقب وPromises المرفوضة، لكن يُنتظر المراقب async قبل استمرار معالجة الرسائل اللاحقة. اجعله سريعًا. راجع ونقّح `id` و`data` و`cause` الخام قبل تسجيلها.

## Reconnect

يملك SSE سلوك retry مدمجًا لأخطاء الشبكة وقراءة stream. يغلق EOF العادي stream مع `code: 'eof'`؛ ولا يعيد الاتصال.

يبدأ retry افتراضيًا من ثانية واحدة وليس له حد. اضبط `attempts` لوضع حد:

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

تعني `attempts` عدد retries بعد المحاولة الأولى. تعطل `attempts: 0` إعادة المحاولة. يبدأ `attempt` الممرر إلى `shouldReconnect` من 1 لأول retry، ويبقى تراكميًا طوال عمر stream المنطقي؛ لا يعيده نجاح اتصال فعلي إلى الصفر.

يبدأ التأخير بقيمة retry interval الحالية. يستطيع الخادم تحديثها عبر حقل SSE باسم `retry:`. يطبق `factor` نموًا أسيًا، وتضع `maxDelayMs` حدًا للقيمة الأساسية. بعد ذلك تضيف `jitter` عددًا عشوائيًا من المللي ثانية بين صفر والقيمة المضبوطة. ولأن jitter تضاف بعد الحد، قد يتجاوز التأخير النهائي `maxDelayMs` بمقدار أقل من `jitter`.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

يرسل transport أحدث event ID في `Last-Event-ID` في المحاولات اللاحقة. اجعل `shouldReconnect` غير رامٍ. لا يضمن التنفيذ الحالي أن predicate يرمي أو يعيد Promise مرفوضًا سيُنهي كل iterator أو كل مسار `stream.closed` معلق.

إخفاقات التحقق من HTTP/open، والأخطاء القاتلة في معالجة الرسائل، وEOF العادي ليست خطأ شبكة أو قراءة قابلًا لإعادة المحاولة. لا تفترض أن كل مسار نهائي يعيد الاتصال.

## طابور العمل المشترك

الـ async iterable هو طابور عمل مشترك واحد للـ stream المنطقي. وليس subscription أو broadcast أو آلية backpressure.

يكون الطابور غير محدود افتراضيًا. ضع حدًا باستخدام `withSSEQueue(...)` أو `withSSEOptions({ queue })`:

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | السلوك عند الحد                           |
| ------------- | ----------------------------------------- |
| `drop-newest` | يهمل event الواصل.                        |
| `drop-oldest` | يزيل أقدم event مخزّن ثم يضيف الجديد.     |
| `error`       | يرمي queue overflow error وينهي المعالجة. |

تتنافس iterators المتعددة على القيم؛ ولا تحصل كل واحدة على نسخة. لا يؤدي `break` من حلقة `for await` إلى إغلاق transport، لأن iterator لا يملك تنفيذ `return()` واعيًا بدورة الحياة. استدعِ `stream.close(...)` صراحة.

يحدد الإغلاق أن الطابور انتهى، لكنه لا يحذف القيم المخزنة مسبقًا. يستطيع المستهلك تصريفها قبل أن تعيد iteration التالية `done: true`.

### حد Parser Buffer

طابور الأحداث وparser buffer شيئان منفصلان. اضبط `maxBufferSize` موجبة عبر `withSSEOptions(...)` لوضع حد للـ bytes المحتفظ بها لسطر SSE غير مكتمل:

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

يؤدي تجاوز الحد بعد البدء إلى رفض iterator وإغلاق stream مع `code: 'error'`. وترك القيمة غير محددة يبقي parser buffer غير محدود.

## الإغلاق النهائي

تُحل `stream.closed` بالقيمة التالية:

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- تعني `eof` أن response body انتهى بصورة عادية.
- تشمل `aborted` الاستدعاء الصريح لـ `stream.close(...)` أو مسار الإلغاء.
- تعني `error` أن retry توقف أو وقع خطأ stream نهائي.

`stream.close(reason)` idempotent. تلغي أعمال النقل النشطة، وتغلق queue أمام pushes الجديدة، وتحل `stream.closed`. لا يفعل `break` أيًا من ذلك.

حد التطبيق الذي يفتح stream يملك إغلاقه. لا يغلقه client أو framework provider تلقائيًا.

## التالي

- تغطي [WebSocket](/ar/core/web-socket) الجلسات ثنائية الاتجاه وreconnect الاختياري.
- تغطي [المعترضات](/ar/core/interceptors) تغيير headers في SSE ومراقبة دورة الحياة.
- تشرح [الأخطاء](/ar/core/errors) توفر response عند فشل البدء.
