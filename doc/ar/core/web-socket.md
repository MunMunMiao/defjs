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

تعيد WebSocket:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

العنصر الثالث عند النجاح هو لقطة اتصال البدء. قد يحتوي `url` و`protocol` و`extensions` الملتقطة عند فتح أول socket فعلي.

أما `session.connection` فهو getter حي. يستبدل reconnect الـ socket الفعلي الأساسي وقد يحدّث هذه القيمة. احتفظ بالعنصر الثالث من الـ tuple عندما تكون لقطة البدء مهمة.

لا تسجّل connection URLs. فقد تحتوي على path identifiers وapplication query data وحقول نشر telemetry.

## الجلسة الحية

تمثل `WebSocketSession` جلسة منطقية واحدة قد تمتد عبر عدة محاولات اتصال فعلية.

| العضو                      | السلوك                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| `connection`               | أحدث معلومات connection الحية.                                   |
| `state`                    | حالة الجلسة المنطقية الحية.                                      |
| `receive`                  | طابور عمل async مشترك للرسائل الواردة بعد التحقق.                |
| `send(message)`            | يتحقق من outgoing message ويرمزها ثم يرسلها أو يضيفها إلى queue. |
| `close(code?, reason?)`    | يطلب إغلاقًا نهائيًا.                                            |
| `closed`                   | Promise بمعلومات الإغلاق النهائي المرصودة.                       |
| `onStateChange(listener)`  | يضيف state observer ويعيد دالة إلغاء الاشتراك.                   |
| `onRuntimeError(listener)` | يضيف runtime-error observer ويعيد دالة إلغاء الاشتراك.           |

لا يتتبع العميل الجلسة بعد إعادتها. يملك المستدعي الاستهلاك والمراقبين والإلغاء والإغلاق.

## استقبال الرسائل

تُفك رسائل النص وArrayBuffer وtyped-array وBlob على أنها JSON بترميز UTF-8. تُسقط المدخلات التالية بصمت:

- JSON غير صالح؛
- envelope ليس كائنًا؛
- `type` مفقود أو string فارغ؛
- نوع غير معروف من دون Struct باسم `incoming.default`.

بعد اختيار Struct، يُرسل فشل فك الترميز إلى `onRuntimeError` وتُسقط الرسالة.

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

الـ incoming iterable طابور عمل مشترك واحد غير محدود. تتنافس iterators المتعددة على الرسائل؛ وليست subscriptions مستقلة. ولا يبطئ transport الخادم عندما تنمو queue. استهلك الرسائل الواردة دائمًا أو أغلق الجلسة سريعًا.

## إرسال الرسائل

`send(...)` متزامنة. وقد ترمي تزامنيًا عندما:

- لا تملك نقطة النهاية خريطة `outgoing`؛
- لا تملك الرسالة `type` صالحًا؛
- يكون النوع غير معلن؛
- يفشل فك payload البنيوي أو ترميزه؛
- تستخدم send queue محدودة `overflow: 'error'`؛
- يرمي native socket أثناء إرسال فوري.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

تدخل الرسائل المرسلة قبل open أو بين محاولات reconnect إلى outgoing send queue. وتُصرّف queue عند فتح socket فعلي.

لا تستدعِ `send` بعد الوصول إلى حالة نهائية. لا يوفّر التنفيذ الحالي عقد رفض مستقرًا بعد الإغلاق، وقد لا تُرسل البيانات الموضوعة في queue بعد الإغلاق النهائي أبدًا.

## الحالة

يمكن أن تكون `session.state`:

| الحالة         | المعنى                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `idle`         | الحالة الداخلية الأولى قبل بدء التنفيذ.                                                                   |
| `connecting`   | بدء أول محاولة فعلية.                                                                                     |
| `open`         | آخر حالة منطقية صادرة بعد فتح socket فعلي. أثناء تأخير reconnect قد تبقى `open` رغم عدم وجود socket فعلي. |
| `reconnecting` | بدء محاولة فعلية لاحقة بعد انقضاء تأخيرها.                                                                |
| `closing`      | إغلاق socket نشط في حالة connecting أو open بسبب الإلغاء.                                                 |
| `closed`       | إغلاق نهائي بلا خطأ مطبّع.                                                                                |
| `aborted`      | إلغاء خارجي نهائي طُبّع إلى `ABORTED`.                                                                    |
| `error`        | فشل نهائي آخر.                                                                                            |

لا تُصدر `reconnecting` أثناء التأخير. بل تُصدر عند بدء المحاولة التالية بعد التأخير. تعامل مع `session.state` على أنها آخر حالة lifecycle صادرة، لا دليلًا على وجود native socket حاليًا. تدخل الرسائل المرسلة خلال هذه الفجوة إلى outgoing queue.

تعمل state listeners مباشرة. اجعلها غير رامية وألغِ اشتراكها عند انتهاء مالكها.

### قبل كل محاولة

يمكن ضبط `beforeConnect` على العميل أو على تنفيذ واحد. تعمل قبل native constructor في المحاولة الأولى وكل محاولة reconnect:

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

يكون command input وإسقاط الطلب قد بُنيا بالفعل. لا تعيد hook تشغيل `build` ولا تغيّر قيم query المرتبطة. استخدمها لتحضير يملكه التطبيق، مثل تحديث حالة تستخدمها آلية handshake في البيئة. الرمي أو رفض Promise فشل نقل نهائي؛ ولا يمر إلى reconnect predicate الخاص بنتيجة الإغلاق.

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

اجعل `shouldReconnect` متزامنة وغير رامية. يغطي reconnect socket فعليًا جديدًا داخل الجلسة المنطقية نفسها. وتنتمي incoming وoutgoing queues إلى تلك الجلسة المنطقية.

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

عندما تنتهي `timeoutMs` موجبة، يرسل وقت التشغيل `Error('WebSocket heartbeat timeout')` إلى runtime-error listeners، ويطلب native close بالرمز `4000` والسبب `heartbeat timeout`. ما زال reconnect يحتاج إلى سياسة منفصلة تسمح بالإغلاق الناتج.

أبقِ `timeoutMs < intervalMs`. لا يتحقق التنفيذ الحالي من هذه العلاقة، وقد يتداخل timeout يساوي interval أو يتجاوزه مع heartbeat timers لاحقة.

## Queues

يضبط خيار `queue` الرسائل الصادرة فقط:

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

تكون outgoing queue غير محدودة افتراضيًا. وعندما تكون محدودة، يكون overflow الافتراضي `drop-oldest`؛ والبديلان هما `drop-newest` و`error`. يمسح الإغلاق النهائي send queue هذه.

لا تملك incoming queue خيار bound أو overflow عامًا. إنها طابور عمل مشترك غير محدود ولا توفر backpressure. يجب على مالكي الموارد استهلاكها باستمرار أو إغلاق الجلسة.

## ملكية الإغلاق

تستدعي `session.close(code, reason)` دالة `close` للـ native socket الحالي وتلغي الجلسة المنطقية بعلامة manual close. إنها تطلب الإغلاق؛ ولا تضمن إتمام مصافحة الإغلاق بصورة سليمة أو حالة `closing` ظاهرة أو أن قيمة `closed` النهائية ستطابق code وreason المطلوبين حرفيًا.

تُحل `session.closed` من معلومات الإغلاق التي يرصدها وقت التشغيل:

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

قد يؤخر native implementation لا يصدر close event تسوية Promise. وقد ينتهي الإلغاء الخارجي إلى `aborted` أو `error` بحسب السبب المطبّع، ويمكنه تجاوز `closing` عندما تكون الجلسة بين المحاولات.

ألغِ اشتراك listeners وأغلق عند حد component أو route أو job أو service الذي فتح الجلسة. لا يؤدي provider unmount وحده هذا العمل.

## أمان URL والمصادقة

تتحول HTTP base URLs إلى WebSocket schemes: يتحول `http:` إلى `ws:` و`https:` إلى `wss:`. لا تُرمّز path placeholders كـ segments. وتستخدم قيم query الـ serializer المضبوط.

أولوية protocols هي خيار التنفيذ ثم خيار العميل ثم تعريف نقطة النهاية. تمنع مصفوفة protocols فارغة صراحة القيم الأقل أولوية.

لا تستطيع browser WebSocket APIs ضبط handshake headers اعتباطية. لا تعامل query parameters على أنها قناة credentials عامة؛ فقد تسجّل URLs في أدوات المتصفح وproxies وaccess logs وtelemetry. استخدم TLS (`wss:`) وتصميم مصادقة خضع للمراجعة في بيئة النشر، مثل تدفق same-site cookie مناسب أو connection ticket قصير العمر.

## التالي

- تقارن [SSE](/ar/core/sse) سلوك stream retry والـ queue.
- توضّح [المعترضات](/ar/core/interceptors) كيفية الحفاظ على live session getters.
- تغطي [الأخطاء](/ar/core/errors) فشل startup tuple.
