---
title: WebSocket
description: ابدأ جلسة JSON مُنوَّعة، استقبل وأرسل أغلفة، ثم أغلق وانتظر closed.
---

# WebSocket

ابدأ → استقبل → أرسل → أغلق + `await session.closed`. أنت تملك إلغاء الاشتراك والتخلص. العملاء والمزوّدون والمعترضات لا تغلق الجلسات تلقائيًا.

## الإعداد الأساسي

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, openedSession, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using session = openedSession
  const unsubscribe = session.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    session.send({ type: 'send', text: 'Hello' })
    for await (const message of session.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## غلاف JSON

`defineWebSocket(...)` يصف نقطة نهاية رسائل JSON. خريطة `incoming` المطلوبة تختار Struct حسب نوع الرسالة؛ `outgoing` الاختياري يفعل الشيء نفسه لـ `session.send(...)`. كل رسالة على السلك كائن بـ `type` سلسلة غير فارغة.

حقول حمولة الكائن تجلس بجانب `type`. حمولات القيم القياسية والمصفوفات تستخدم حقل الغلاف `data`:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

خريطة الرسالة تتحكم بالحمولة، لا بمميّز الغلاف. `incoming.default` يقبل أسماء أنواع غير معلَنة بخلاف ذلك؛ بدونه، الأنواع المجهولة تُسقط. إطارات النص الواردة و`ArrayBuffer` والمصفوفة المُنوَّعة و`Blob` تُفك كـ UTF-8 JSON. JSON التالف وأعطال Struct تذهب إلى مراقبي أخطاء وقت التشغيل — لا إلى `receive`.

إذا كان لحمولة كائن حقل باسم `data`، يبقى بجانب `type` بعد الترميز (وليس غلافًا متداخلًا). مثال: `write` مع `{ data: string, source: string }` يُسلك كـ `{ type: 'write', data: string, source: string }`. قيمة جانب المستدعي ما زالت `{ type: 'write', data: { data, source } }` لأن `data` يحمل حمولة الكائن قبل التسلسل. الأسماء المستعارة تُطبَّق على حقول الحمولة. مميّز `type` يخص الغلاف، لا الـ Struct.

`session.send(...)` يتحقق ويُسلسل بشكل متزامن. يرسل فورًا عندما يكون مفتوحًا، ويصف أثناء `reconnecting` عندما يُفعَّل طابور صادر، ويرمي `InvalidStateError` عندما لا يكون قابلاً للكتابة. يرمي أيضًا عندما لا توجد خريطة صادرة، أو نوع غير معلَن، أو فشل تحقق الحمولة، أو طابور صادر معطّل/ممتلئ، أو فشل إرسال أصلي.

`receive` لمستهلك واحد. مكرّر ثانٍ يُرفض.

## لقطات الحالة

| العضو                      | المعنى                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `state`                    | `idle` أو `connecting` أو `open` أو `reconnecting` أو `closing` أو `closed` أو `aborted` أو `error` |
| `connection`               | أحدث اتصال مادي: `generation`، URL، بروتوكول متفاوض، امتدادات عند التوفر                            |
| `bufferedAmount`           | عدد البايتات الأصلية غير المرسلة، أو `0` بلا مقبس مادي                                              |
| `receive`                  | قابل للتكرار غير متزامن لمستهلك واحد من الرسائل الواردة المتحقق منها                                |
| `onStateChange(listener)`  | اشترك في انتقالات الحالة المنطقية؛ يُرجع إلغاء الاشتراك                                             |
| `onRuntimeError(listener)` | اشترك في أخطاء وقت التشغيل غير بدء التشغيل؛ يُرجع إلغاء الاشتراك                                    |
| `closed`                   | وعد لنتيجة الإغلاق النهائي المنطقي                                                                  |

`open` = المقبس المادي مفتوح. `reconnecting` يشمل التحضير + التأخير قبل البديل. `connection.generation` يزيد لكل مقبس مادي يصل إلى `open`. `startupConnection` في الـ tuple تبقى أول لقطة ناجحة؛ `session.connection` يتحرك للأمام.

فشل البدء → `[error, undefined, connection?]`. فشل المُنشئ قبل الفتح قد بلا اتصال؛ المهلة/الإغلاق أثناء البدء قد ما زالت تقدّم لقطة. بعد إرجاع الجلسة، أخطاء وقت التشغيل تسير عبر المراقبين و`receive` و`closed` — لا tuple تنفيذ ثانٍ.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## أعد الاتصال

إعادة الاتصال اختيارية. بلا كائن `reconnect` → الإغلاق المادي ينهي الجلسة المنطقية. عند الضبط، الافتراضات هي `attempts: 3` و`delayMs: 1000` و`factor: 2` و`maxDelayMs: 30000` و`jitter: 0`. `attempts` يعدّ المحاولات بعد المحاولة الأولية؛ `attempts: 0` يعطّل. المسند الافتراضي يقبل كل نتيجة إغلاق.

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` يحصل على محاولة إعادة المحاولة التالية وسبب الإغلاق والرمز والسبب و`wasClean`. `session.close(...)` اليدوي لا يدخل المسند. رمي التحضير/السياسة ينهي الجلسة المنطقية بخطأ.

تذبذب تراجع WebSocket **ضربي** (`jitter: 0.2` → تأخير بين `0.8x` و`1.2x`). تذبذب SSE عامل ضربي 0–1، مثل WebSocket. قيم التأخير/المعامل/التذبذب/المحاولة تُتحقق قبل المُنشئ؛ تأخيرات المؤقت لا يمكن أن تتجاوز `2_147_483_647` مللي ثانية.

`beforeConnect({ attempt, signal })` يعمل قبل المُنشئ الأولي وكل إعادة اتصال. مرّر إشارته إلى تحديث الرمز حتى يوقف الإلغاء التحضير والاتصال معًا.

## نبض القلب

اختياري عند التنفيذ أو نطاق العميل. الفاصل يرسل `message()` عبر خريطة Struct الصادرة. `isAck(message)` الاختياري يتعرّف على إقرار — تلك الرسالة تمسح المهلة و**لا** تُسلَّم إلى `receive`.

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` و`timeoutMs` يجب أن يكونا مؤقتين محدودين موجبين ≤ `2_147_483_647`. رسالة نبض القلب يجب أن تكون صالحة لخريطة الصادرة. التسلسل والإرسال الأصلي وتصنيف الإقرار وأعطال المهلة قاتلة للجلسة المنطقية — لا تصبح إعادة اتصال عادية.

## الطوابير

| الإعداد                | القيمة المطلوبة                              | السلوك                                                                                                   |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | عدد صحيح آمن موجب                            | يحد الرسائل المحلَّلة المنتظرة لـ `receive` والإطارات الخام المنتظرة للتحويل. الفيضان → `state: 'error'` |
| `maxOutgoingQueueSize` | عدد صحيح آمن غير سالب اختياري؛ الافتراضي `0` | FIFO فقط بينما `state === 'reconnecting'`. ممتلئ/معطّل → `send(...)` يرمي                                |

الإطارات الصادرة المصطفّة تُفرَّغ قبل أن ينشر المقبس البديل `open`. الإطارات المرسلة بالفعل على مقبس سابق لا تُعاد تلقائيًا أبدًا. طوابير إعادة الاتصال للرسائل التي ترسلها أثناء إعادة الاتصال — لا لإعادة بناء حالة التطبيق.

فيضان الوارد يمسح التسلسل المعلق، ويفشل `receive`، ويوقف الجلسة، ويحل `session.closed` بـ `kind: 'error'`. أبقِ المستهلك سريعًا بما يكفي أو ارفع الحد من الحجم/الذاكرة المقاسة.

## البروتوكولات والمصادقة

`protocols` في التعريف، و`withWebSocketProtocols(...)` في العميل، و`protocols` في التنفيذ تضبط قائمة البروتوكول الفرعي للمُنشئ. الأسبقية: التنفيذ → العميل → التعريف. أول قائمة معرّفة تُنسخ للجلسة المنطقية وتُعاد استخدامها عند إعادة الاتصال.

مُنشئات WebSocket في المتصفح لا تقبل رؤوس مصافحة عشوائية. Defjs تحوّل `http:` → `ws:` و`https:` → `wss:`، ترمّز عناصر المسار النائبة مرة، تستخدم مُسلسل الاستعلام المضبوط. بناء استعلام WebSocket أيضًا يُسلسل قيم الاستعلام المعقدة كـ JSON (بخلاف استعلام HTTP الافتراضي للقيم القياسية فقط).

`withCredentials(true)` هو بيانات اعتماد Fetch لـ HTTP/SSE — وليست مصادقة WebSocket. استخدم سياسة ملف تعريف ارتباط/جلسة مراجعة، أو بروتوكولًا فرعيًا، أو تذكرة اتصال قصيرة العمر. لا تضع بيانات اعتماد عامة أو أسرارًا طويلة العمر في سلسلة الاستعلام.

## الإغلاق والملكية

`session.close(code?, reason?)` يطلب إغلاقًا نهائيًا ويوقف نبض القلب. الرمز يجب أن يكون `1000` أو `3000..4999`؛ السبب ≤ 123 بايت UTF-8. وسائط الإغلاق غير الصالحة ترمي قبل تغيير الحالة.

`await using` يطلب الإغلاق ثم ينتظر teardown المملوك لـ Defjs. `close()` و`closed` يظلان صالحين عندما تحتاج سببًا يدويًا أو نتيجة النهاية المنطقية.

`kind` النهائي: `'closed'` أو `'aborted'` أو `'error'`، مع `code` / `reason` / `wasClean` أصلي اختياري و`cause` للإلغاء/الخطأ. `closed` يصف النهاية المنطقية ولا يثبت إغلاق TCP المادي. disposer ذو teardown محدود بثانية واحدة؛ إذا لم يُرصد حدث close، يكمل تنظيف Defjs وقد يرفض بـ `DOMException` اسمه `TimeoutError`، بينما يبقى `closed` نتيجة الإغلاق اليدوي المنطقية. حقول الإغلاق الأصلية المرصودة تفوز على احتياطي المالك المطلوب.

## حد GraphQL

Defjs توفّر غلاف JSON مُنوَّعًا ودورة حياة جلسة منطقية. **لا** تنفّذ بروتوكول تطبيق WebSocket. ميزات GraphQL-over-WebSocket — تهيئة الاتصال، معرّفات العملية، `next`/`error`/`complete`، التخلص، إعادة تشغيل الاشتراك — خارج العقد الأساسي.

استخدم عميل بروتوكول مثل `graphql-ws` عندما يتطلب الخادم ذلك البروتوكول، أو نمذج غلافك بـ `defineWebSocket(...)`. خريطة رسائل وحدها لا تتفاوض دلالات GraphQL.

## وصفات ذات صلة

- [فتح جلسة WebSocket](../recipes/websocket-session.md)
- [استهلاك تدفق SSE](../recipes/consume-sse.md)
