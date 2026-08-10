---
title: WebSocket
description: عرّف message envelopes، وابدأ جلسات حية وراقبها، واستهلك العمل الوارد، واضبط reconnect وheartbeat الاختياريين، وأغلق الموارد التي تملكها.
---

# WebSocket

تنشئ `defineWebSocket(...)` منشئ أمر لنقطة نهاية WebSocket تتبادل رسائل JSON.

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## Message Envelope

تستخدم كل رسالة كائن JSON يحتوي `type` غير فارغ من نوع string. يختار هذا النوع Struct من `incoming` أو `outgoing`.

في payload كائني، يمكن أن تأتي الحقول بجانب `type`:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

إذا كانت الحمولة قيمة مفردة أو مصفوفة، فضعها داخل `data`:

```json
{ "type": "count", "data": 3 }
```

المفتاحان `type` و`data` محجوزان للـ envelope. إذا احتوى object payload نفسه على حقل `data`، فغلّف payload كاملًا كي لا يخلط وقت التشغيل بين ذلك الحقل وpayload الخاص بالـ envelope:

```typescript
const audit = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

شكل wire المقابل هو `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`.

لا تعلن `type` كحقل payload عادي، إذ تملكه عملية تطبيع الـ envelope.

يتعامل `incoming.default` الاختياري مع أنواع الرسائل الأخرى غير المعلنة. ومن دونه تُسقط الأنواع غير المعروفة.

## Tuple البدء

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

يجب أن تكون قيمة `timeout` لتنفيذ HTTP وSSE وWebSocket عددًا صحيحًا موجبًا وآمنًا ضمن `1..2_147_483_647`؛ وتؤدي القيم `0` أو السالبة أو الكسرية أو `NaN` أو `Infinity` أو التي تتجاوز الحد إلى `REQUEST_VALIDATION_FAILED` قبل إنشاء أي مورد request أو stream أو socket.

تعيد WebSocket:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

العنصر الثالث عند النجاح هو لقطة اتصال البدء ذات `generation: 1`. قد يحتوي `url` و`protocol` و`extensions` الملتقطة عند فتح أول socket فعلي.

أما `session.connection` فهو getter حي؛ يزيد `generation` عند كل فتح فعلي ناجح. احتفظ بالعنصر الثالث من الـ tuple عندما تكون لقطة البدء مهمة.

لا تسجّل connection URLs. فقد تحتوي على path identifiers وapplication query data وحقول نشر telemetry.

## الجلسة الحية

تمثل `WebSocketSession` جلسة منطقية واحدة قد تمتد عبر عدة محاولات اتصال فعلية.

| العضو                      | السلوك                                                                       |
| -------------------------- | ---------------------------------------------------------------------------- |
| `connection`               | أحدث معلومات connection الحية.                                               |
| `bufferedAmount`           | عدد بايتات native socket غير المرسلة، أو `0` عند غيابه.                      |
| `state`                    | حالة الجلسة المنطقية الحية.                                                  |
| `receive`                  | طابور عمل async مشترك للرسائل الواردة بعد التحقق.                            |
| `send(message)`            | يفحص قابلية الكتابة ثم يتحقق من الرسالة ويرمزها ويرسلها أو يضيفها إلى queue. |
| `close(code?, reason?)`    | يطلب إغلاقًا نهائيًا.                                                        |
| `closed`                   | Promise بمعلومات الإغلاق النهائي المرصودة.                                   |
| `onStateChange(listener)`  | يضيف state observer ويعيد دالة إلغاء الاشتراك.                               |
| `onRuntimeError(listener)` | يضيف runtime-error observer ويعيد دالة إلغاء الاشتراك.                       |

لا يتتبع العميل الجلسة بعد إعادتها. يملك المستدعي الاستهلاك والمراقبين والإلغاء والإغلاق.

## استقبال الرسائل

تُفك رسائل النص وArrayBuffer وtyped-array وBlob بالترتيب الذي وصلت به على أنها JSON بترميز UTF-8. تُسقط المدخلات التالية بصمت:

- envelope ليس كائنًا؛
- `type` مفقود أو string فارغ؛
- نوع غير معروف من دون Struct باسم `incoming.default`.

يُرسل JSON غير الصالح وفشل التحقق من Struct المحدد إلى `onRuntimeError`، وتُسقط الرسالة وتستمر الجلسة.

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

يسمح `receive` بـ iterator واحد فقط. `maxIncomingQueueSize` حد عناصر موجب وإلزامي؛ overflow يمسح القيم المخزنة ويفشل iterator وينهي الجلسة كـ `error`.

## إرسال الرسائل

`send(...)` متزامنة. وقد ترمي تزامنيًا عندما:

- لا تملك نقطة النهاية خريطة `outgoing`؛
- لا تملك الرسالة `type` صالحًا؛
- يكون النوع غير معلن؛
- يفشل فك payload البنيوي أو ترميزه؛
- تكون outgoing queue المملوكة للـ endpoint معطلة أو ممتلئة أثناء `reconnecting`؛
- يرمي native socket أثناء إرسال فوري.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

تُفحص قابلية الكتابة المنطقية قبل validation أو serialization للـ payload. لا يحدث الإرسال المباشر إلا عندما تكون الحالة المنطقية والـ socket الفعلي الحالي `open`. ولا يحدث enqueue إلا أثناء `reconnecting` عندما تكون `maxOutgoingQueueSize` في endpoint موجبة. تُصرّف FIFO قبل أن يعلن socket البديل حالة `open`.

أثناء الإغلاق اليدوي أو بعد الحالة النهائية أو بينما لم يحسم reconnect predicate إغلاقًا بعيدًا بعد، ترمي `send` خطأ `InvalidStateError`. لا يعيد transport تشغيل frames سبق إرسالها إلى socket فعلي سابق.

## الحالة

يمكن أن تكون `session.state`:

| الحالة         | المعنى                                    |
| -------------- | ----------------------------------------- |
| `idle`         | الحالة الداخلية الأولى قبل بدء التنفيذ.   |
| `connecting`   | بدء أول محاولة فعلية.                     |
| `open`         | الـ socket الفعلي الحالي مفتوح.           |
| `reconnecting` | يجري تحضير محاولة فعلية لاحقة أو تأخيرها. |
| `closing`      | طلب المالك إغلاقًا يدويًا.                |
| `closed`       | إغلاق نهائي بلا خطأ مطبّع.                |
| `aborted`      | إلغاء خارجي نهائي طُبّع إلى `ABORTED`.    |
| `error`        | فشل نهائي آخر.                            |

تصف `session.state` دورة الحياة المنطقية، ولا تثبت وجود native socket حالي. أثناء `reconnecting` تستخدم `send` السعة الصادرة المملوكة للـ endpoint.

تُعزل أخطاء observers: يُرسل خطأ state listener إلى runtime-error listeners، ويُمرر خطأ هؤلاء إلى `globalThis.reportError` عند توفرها. تحرر التسوية النهائية كل observers؛ وألغِ الاشتراك إذا انتهى المالك قبل ذلك.

### قبل كل محاولة

يمكن ضبط `beforeConnect` على العميل أو على تنفيذ واحد. تعمل قبل native constructor في المحاولة الأولى وكل محاولة reconnect:

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

تستقبل hook الكائن `{ attempt, signal }`؛ تبدأ `attempt` من `0` وتزداد عند reconnect. مرّر `signal` إلى async work الذي تملكه. يتسابق abort وtimeout مع hook، ويُستهلك late rejection، ولا يمكن لنتيجة متأخرة إنشاء socket. الرمي أو الرفض فشل transport نهائي.

## Reconnect اختياري

عدم وجود كائن reconnect يعني عدم إعادة الاتصال. اضبطه على العميل أو لكل تنفيذ:

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

تعني `attempts` عدد retries بعد المحاولة الأولى. يؤدي تمرير كائن فارغ إلى تفعيل ثلاث retries بهذه القيم الافتراضية:

| الحقل             | الافتراضي                    |
| ----------------- | ---------------------------- |
| `attempts`        | `3`                          |
| `delayMs`         | `1000`                       |
| `factor`          | `2`                          |
| `maxDelayMs`      | `30000`                      |
| `jitter`          | `0`                          |
| `shouldReconnect` | يعيد `true` لكل نتيجة إغلاق. |

يعيد predicate الافتراضي المحاولة بعد remote close سواء كان clean أو unclean. اضبط predicate عندما يجب أن يكون clean close نهائيًا. يبدأ `attempt` من 1 لأول retry.

قيمة التأخير الأساسية هي `min(delayMs * factor ** (attempt - 1), maxDelayMs)`. jitter في WebSocket مضاعِفة: تختار قيمة مثل `0.2` عاملًا عشوائيًا بين `0.8` و`1.2`. وهذا يختلف عن jitter في SSE التي تُضاف بوحدة المللي ثانية.

تكون `shouldReconnect` متزامنة. الرمي ينهي session كـ `error`، وإرجاع `false` صراحة ينهيها كـ `closed`. ينشئ reconnect socket فعليًا جديدًا فقط ولا يعيد أي send سابق. عند زيادة `session.connection.generation` أعد فقط subscriptions النشطة والآمنة لإعادة التشغيل، ولا تعد mutations.

## Heartbeat

heartbeat اختيارية أيضًا:

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

يجب أن تنتج `message` قيمة صالحة لخريطة `outgoing` الخاصة بنقطة النهاية. تمسح الرسالة التي تتعرف عليها `isAck` heartbeat timeout ولا تدخل `receive`.

أخطاء serialization أو send أو ack predicate أو timeout في heartbeat كلها fatal. تُخطر runtime-error listeners، وتفشل `receive`، وتنهي session كـ `error` من دون استشارة reconnect policy.

يجب أن تكون `intervalMs` و`timeoutMs` عند تعريفها موجبتين ومحدودتين ولا تتجاوزان `2_147_483_647`. ما دام ack deadline قائمًا، لا ترسل interval ticks التالية ping جديدًا ولا تعيد ضبط deadline؛ ويمسحه ack أو توقف session.

## Queues

توجد حدود الـ queue في تعريف endpoint. يجب أن تكون `maxIncomingQueueSize` عددًا صحيحًا آمنًا موجبًا؛ والـ overflow خطأ نهائي يمسح القيم المخزنة. أما `maxOutgoingQueueSize` فهو عدد صحيح آمن غير سالب، وقيمته الافتراضية `0`؛ والقيمة الموجبة تحفظ الإطارات بترتيب FIFO بين المحاولات وترفض overflow دون حذف الإطارات الأقدم.

كلا الحدين يحسب العناصر لا البايتات. يعرض `session.bufferedAmount` تراكم البايتات في native socket بشكل منفصل. ويجب أن يكون لـ `receive` iterator واحد فقط.

## ملكية الإغلاق

تتحقق `session.close(code, reason)` أولًا من أن code هو `1000` أو ضمن `3000..4999` وأن reason لا يتجاوز 123 بايت UTF-8. تنتقل القيم الصالحة إلى `closing` وتطلب native close وتنتظر `CloseEvent` الفعلي؛ code وreason المرصودان يسبقان القيم المطلوبة.

تُحل `session.closed` من معلومات الإغلاق التي يرصدها وقت التشغيل:

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

ينتج عن manual close وremote close بلا cause ورفض reconnect صراحةً `closed`. ينتج عن external abort حالة `aborted`، وعن timeout وruntime failure حالة `error`. إذا رمى native close تُجرّب مرة واحدة بلا arguments؛ وإذا رمى الاستدعاءان تتم التسوية كـ `error` بلا استدعاء ثالث.

ألغِ اشتراك listeners وأغلق عند حد component أو route أو job أو service الذي فتح الجلسة. لا يؤدي provider unmount وحده هذا العمل.

## أمان URL والمصادقة

تتحول HTTP base URLs إلى WebSocket schemes: يتحول `http:` إلى `ws:` و`https:` إلى `wss:`. مرّر قيم path-placeholder الخام؛ يرمّز Core كل segment مرة واحدة بالضبط، ويحوّل `%` إلى `%25`، ويرفض القيمة الفارغة و`.` و`..`. تستخدم قيم query الـ serializer المضبوط.

أولوية protocols هي خيار التنفيذ ثم خيار العميل ثم تعريف نقطة النهاية. تمنع مصفوفة protocols فارغة صراحة القيم الأقل أولوية.

لا تستطيع browser WebSocket APIs ضبط handshake headers اعتباطية. لا تعامل query parameters على أنها قناة credentials عامة؛ فقد تسجّل URLs في أدوات المتصفح وproxies وaccess logs وtelemetry. استخدم TLS (`wss:`) وتصميم مصادقة خضع للمراجعة في بيئة النشر، مثل تدفق same-site cookie مناسب أو connection ticket قصير العمر.

## التالي

- تقارن [SSE](/ar/core/sse) سلوك stream retry والـ queue.
- توضّح [المعترضات](/ar/core/interceptors) كيفية الحفاظ على live session getters.
- تغطي [الأخطاء](/ar/core/errors) فشل startup tuple.
