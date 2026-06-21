---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

يستخدم Defjs `defineEventStream` لتعريف نقاط نهاية SSE (Server-Sent Events) مكتوبة. بعد التنفيذ، تُرجع ثلاثية `[error, stream, openInfo]`، حيث `stream` هو iterable غير متزامن لاستهلاك الأحداث المدفوعة من الخادم واحدًا تلو الآخر.

## تعريف دفق الأحداث

عند تعريف نقطة نهاية SSE، أعلن حقل `events` يعيّن أسماء الأحداث إلى مخططات struct. يُحلّل حقل `data` لكل نوع حدث تلقائيًا حسب المخطط المطابق.

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.number(),
      text: struct.string(),
    }),
    heartbeat: struct.string(),
  },
})
```

### مخطط الحدث الافتراضي (احتياطي)

إذا كان الخادم قد يرسل أنواع أحداث غير معلَنة صراحة في `events`، قدّم مخطط `default` كاحتياطي. بدون `default`، يُتجاهل الأحداث غير المعروفة بهدوء.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### دفق الأحداث مع مدخلات

عندما يحتاج الدفق إلى معاملات استعلام أو جسم طلب، قدّم مخطط `input` ودالة `build`. توقيع `build` مطابق لـ `defineRequest`، ويدعم المعلمات والاستعلام والرؤوس.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: {
    chat: struct.object({ user: struct.string(), text: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ roomId: '42' }))
```

## نتيجة التنفيذ

تُرجع `client.execute()` ثلاثية لأوامر SSE:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — غير null عند فشل الاتصال أو التحقق؛ `null` عند النجاح.
- **`stream`** — عند النجاح، `EventStreamHandle` قابل للاستهلاك عبر `for await...of`؛ `undefined` عند الفشل.
- **`open`** — يحتوي على معلومات استجابة الاتصال الأول (`response` و `url`). قد يكون `undefined` عند فشل الاتصال.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message') {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle و stream.closed

ينفذ `EventStreamHandle` واجهة `AsyncIterable`، لذا يمكن استخدامه مباشرة مع `for await...of`. كما يوفر هذه الخصائص:

| الخاصية / الطريقة          | الوصف                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| `open`                     | معلومات الاتصال الأول `EventStreamOpenInfo` (تحتوي على `response` و `url`) |
| `closed`                   | `Promise<EventStreamCloseInfo>`، يُحلّ عند إغلاق الدفق بالكامل             |
| `close(reason?)`           | إغلاق الدفق بشكل فعّال، مع تمرير سبب اختياري                               |
| `[Symbol.asyncIterator]()` | يُرجع مكررًا غير متزامن يستهلك طابور الأحداث                               |

يُحلّ `closed` عندما:

- ينتهي الخادم بشكل طبيعي (`code: 'eof'`)
- إغلاق فعّال عبر `stream.close()` (`code: 'aborted'`)
- خطأ اتصال أو استنفاد إعادة الاتصال (`code: 'error'`)

```typescript
// إغلاق فعّال
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## معالجة الأحداث غير الصالحة: onInvalidEvent

عندما يرسل الخادم حدثًا لا يمكن مطابقته مع أي مخطط في `events` (أو `default`)، أو فشل التحقق من المخطط، يُطلَب مراقب `onInvalidEvent`. هو إعداد على مستوى العميل يُمرّر عبر `sse.onInvalidEvent` وقت `createClient`.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: الخطأ الأصلي عند فشل التحقق
    },
  },
})
```

`onInvalidEvent` هو **مراقب**:

- حتى لو رمى داخليًا، يُتجاهل الاستثناء بهدوء ويستمر الدفق.
- لا يحجب الأحداث اللاحقة عن الاستهلاك.

## إعداد إعادة الاتصال والطابور

يحتوي نقل SSE على إعادة اتصال تلقائية مدمجة، يمكن ضبطها عبر `sse.reconnect` و `sse.queue` على مستوى العميل.

### إعداد إعادة الاتصال

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: {
      attempts: 5, // عدد محاولات إعادة المحاولة القصوى
      delayMs: 1000, // الفاصل الزمني الأولي لإعادة المحاولة
      factor: 2, // معامل التراجع الأسي
      maxDelayMs: 30000, // الفاصل الزمني الأقصى لإعادة المحاولة
      jitter: 1000, // نطاق الاهتزاز العشوائي (مللي ثانية)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  },
})
```

أولوية إعادة الاتصال:

1. إذا أرجع `onerror` `null`، أوقف إعادة الاتصال.
2. إذا أرجع `shouldReconnect` `false`، أوقف إعادة الاتصال.
3. إذا تجاوز حد `attempts`، أوقف إعادة الاتصال.
4. خلاف ذلك، احسب الفاصل الزمني التالي باستخدام `delayMs` + معامل التراجع الأسي `factor` + `jitter`.

> تحمل إعادة الاتصال تلقائيًا رأس `Last-Event-ID` ليتمكن الخادم من الاستئناف من نقطة التوقف.

### إعداد الطابور

تدخل الأحداث طابورًا غير متزامن داخليًا بعد الوصول، ثم تُستهلك من المكرر. يمكنك تحديد حجم الطابور وسلوك الانتشار:

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  },
})
```

| `overflow`    | السلوك                                                          |
| ------------- | --------------------------------------------------------------- |
| `drop-newest` | تجاهل الأحداث الواردة حديثًا، احتفظ بالأحداث القديمة في الطابور |
| `drop-oldest` | تجاهل الأحداث الأقدم، أفسح مجال للأحداث الجديدة                 |
| `error`       | طابور ممتلئ يرمي خطأ، مما يؤدي إلى إغلاق الدفق                  |

## مثال كامل

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  },
})

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.object({ level: struct.string(), msg: struct.string() }),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    console.log(`[${event.data.level}] ${event.data.msg}`)
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## ما التالي

- [العميل →](/core/client) — `createClient` وخيارات `sse`
- [الأوامر →](/core/commands) — تعريفات الأوامر وقواعد المدخلات
- [WebSocket →](/core/web-socket) — اتصال WebSocket وإدارة الحالة
