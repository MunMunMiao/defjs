---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

يوفر `@defjs/core` نقاط نهاية WebSocket مكتوبة عبر `defineWebSocket`. تُعلِن كل نقطة نهاية:

- مخططات `incoming` — الرسائل التي يرسلها الخادم إلى العميل.
- مخططات `outgoing` — الرسائل التي يرسلها العميل إلى الخادم.
- مخطط `input` + معالج `build` — معاملات الطلب وبناء المسار/الاستعلام (اختياري).

تُرمّز الرسائل بـ JSON وتُتحقق وقت التشغيل مقابل المخططات المُعلَنة.

## تعريف نقطة نهاية WebSocket

استخدم `defineWebSocket` لإنشاء منشئ أمر مكتوب. ثم يُنفّذ المنشئ بـ `client.execute()`.

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // اختياري: بناء URL الاتصال من المدخلات
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // الرسائل من الخادم → العميل
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // الرسائل من العميل → الخادم
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### أشكال المخطط

**الرسائل الواردة** مُعيّنة بـ `type`. عند وصول رسالة، يُطابق حقل `type` في JSON مع مفاتيح المخطط. إذا كانت الحمولة كائنًا عاديًا، تُدمج حقولها مع `type`:

```typescript
// الخادم يرسل: { "type": "message", "text": "hi", "userId": 1 }
// العميل يستلم: { type: 'message', text: 'hi', userId: 1 }
```

إذا كانت الحمولة قيمة أساسية أو مصفوفة، تُغلّف تحت `data`:

```typescript
// الخادم يرسل: { "type": "notification", "data": [1, 2, 3] }
// العميل يستلم: { type: 'notification', data: [1, 2, 3] }
```

**الرسائل الصادرة** تتبع نفس الاتفاقية. تقبل طريقة `send()` رسالة بـ `type` يطابق أحد مفاتيح `outgoing`:

```typescript
socket.send({ type: 'message', text: 'hello' })
```

يمكن استخدام مفتاح `default` خاص في `incoming` للتقاط أنواع رسائل غير معلَنة بمخطط مشترك.

## التنفيذ واستهلاك الرسائل

تُرجع `client.execute()` صفًا `[error, socket, connection]`:

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // معالجة فشل البدء (تحقق، نقل، إيقاف، إلخ)
  return
}

// تكرار الرسائل الواردة
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// أو استخدام المكرر غير المتزامن مباشرة
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## واجهة برمجة التطبيقات `WebSocketSession`

| العضو                      | النوع                                      | الوصف                                                                  |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | `{ url?, protocol?, extensions? }` من الـ socket الأساسي.              |
| `state`                    | `WebSocketState`                           | حالة دورة الحياة الحالية (انظر أدناه).                                 |
| `receive`                  | `AsyncIterable<TIncoming>`                 | مكرر غير متزامن للرسائل الواردة المُحقّق منها.                         |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | يُحلّ عند إغلاق الـ socket مع `{ code?, reason?, wasClean?, cause? }`. |
| `send(message)`            | `(message: TOutgoing) => void`             | يرسل رسالة صادرة. يُضاف إلى الطابور إذا لم يكن مفتوحًا بعد.            |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | يغلق الاتصال بأناقة.                                                   |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | يُرجع دالة إلغاء الاشتراك.                                             |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | يُرجع دالة إلغاء الاشتراك.                                             |

```typescript
// مراقبة الحالة
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// أخطاء وقت التشغيل (فشل المخططات، انتهاء مهلة نبضة القلب، إلخ)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// إغلاق بأناقة
socket.close(1000, 'done')
await socket.closed
```

## آلة حالة دورة حياة الاتصال

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| الحالة         | المعنى                                                 |
| -------------- | ------------------------------------------------------ |
| `idle`         | قبل استدعاء `execute()`.                               |
| `connecting`   | فتح محاولة الاتصال الأولى.                             |
| `open`         | تم إنشاء الاتصال، يمكن تدفق الرسائل.                   |
| `closing`      | `close()` أو `abort` تم تفعيله، انتظار حدث الإغلاق.    |
| `closed`       | إغلاق نظيف (لا خطأ، أو إغلاق يدوي).                    |
| `reconnecting` | انقطع الاتصال، انتظار قبل إعادة المحاولة.              |
| `error`        | فشل نهائي (خطأ تحقق، خطأ نقل، إغلاق غير إيقاف مع سبب). |
| `aborted`      | إيقاف صريح عبر `AbortSignal` أو `close()`.             |

تُنشر تحولات الحالة عبر `onStateChange`. ينتهي مكرر `receive` غير المتزامن عندما يصل الـ socket إلى حالة نهائية (`closed`، `error`، أو `aborted`).

## نبضة القلب

اضبط ping/ack دوري للحفاظ على الاتصال حيًا أو اكتشاف الأطراف الميتة.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // إرسال كل 30 ثانية
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // توقع ack خلال 10 ثوانٍ
    isAck: (message) => message.type === 'pong',
  },
})
```

| الخيار       | الوصف                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| `intervalMs` | الفاصل بين إرسال نبضات القلب (مطلوب).                                    |
| `message`    | مصنع يُرجع رسالة نبضة القلب. مكتوب مقابل `TOutgoing`.                    |
| `timeoutMs`  | إذا ضُبط، يُغلق الـ socket برمز `4000` عند عدم وصول ack في الوقت المحدد. |
| `isAck`      | شرط يتعرف على رسالة واردة كاستجابة نبضة قلب.                             |

يمكن ضبط نبضة القلب على مستوى العميل (عبر `createClient({ webSocket: { heartbeat: ... } })`) أو على مستوى الطلب (عبر خيارات `execute()`). يفوز إعداد مستوى الطلب.

## إعادة الاتصال

تُفعّل إعادة الاتصال التلقائية عند انقطاع الاتصال بشكل غير متوقع.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| الخيار            | الافتراضي    | الوصف                                                         |
| ----------------- | ------------ | ------------------------------------------------------------- |
| `attempts`        | `3`          | عدد محاولات إعادة المحاولة القصوى. `<= 0` يعطل إعادة الاتصال. |
| `delayMs`         | `1000`       | التأخير الأساسي قبل إعادة المحاولة الأولى.                    |
| `factor`          | `2`          | معامل التراجع الأسي.                                          |
| `maxDelayMs`      | `30000`      | السقف على التأخير المحسوب.                                    |
| `jitter`          | `0`          | معامل العشوائية (`0`–`1`).                                    |
| `shouldReconnect` | `() => true` | شرط يقرر ما إذا كان إغلاق معين يجب أن يُطلِب إعادة المحاولة.  |

صيغة التأخير: `min(delayMs * factor^(attempt - 1), maxDelayMs)`، ثم يُضاف الاهتزاز.

يمكن أيضًا ضبط إعادة الاتصال على مستوى العميل عبر `createClient({ webSocket: { reconnect: ... } })`.

## طابور الإرسال

تُضاف الرسائل المرسلة قبل أن يصبح الـ socket `open` (أو أثناء انقطاع عابر) إلى طابور وتُدفق بمجرد أن يكون الاتصال جاهزًا.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| الخيار     | الوصف                                           |
| ---------- | ----------------------------------------------- |
| `maxSize`  | أقصى عدد رسائل في الطابور. الافتراضي غير محدود. |
| `overflow` | السلوك عند تجاوز `maxSize`.                     |

يُمسح الطابور عند الإغلاق النهائي (`error`، `aborted`، `closed`).

## سلوك الإغلاق والإيقاف اليدوي

### `socket.close(code?, reason?)`

يقوم بإغلاق بأناقة:

1. يستدعي `WebSocket.close(code, reason)` الأصلي.
2. يُوقف `AbortController` الداخلي بسبب `manual-web-socket-close`.
3. ينتقل الـ socket عبر `closing` → `closed`.
4. يُحلّ `socket.closed` بالرمز والسبب المُقدّمين.

### `AbortSignal` (خارجي)

مرر `AbortSignal` خارجيًا عبر خيارات `execute()`:

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// لاحقًا:
controller.abort() // يغلق الـ socket فورًا وينتقل إلى 'aborted'
```

عند الإيقاف **قبل** فتح الـ socket، يُحلّ `execute()` بخطأ نقل و `socket` هو `undefined`. عند الإيقاف **بعد** الفتح، ينتقل الـ socket إلى `aborted` وينتهي `receive`.

### `timeout`

يدعم المهلة على مستوى الطلب، لكن لا يمكن دمجها مع `abort` في نفس الطلب (يُرجع خطأ تعريف):

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// خطأ — لا يمكن خلط abort و timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## مثال كامل

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## ما التالي

- [SSE →](/core/sse) — Server-Sent Events مع مخططات مكتوبة وإعادة اتصال.
- [العميل →](/core/client) — إنشاء العميل وإعداد WebSocket.
- [الأوامر →](/core/commands) — قواعد `defineWebSocket` المدخلات والبناء.
