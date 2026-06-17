---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# الأوامر

يبنى Defjs حول "أوامر": كائنات قابلة للتنفيذ مكتوبة الآمنة أنواعًا يُنشئها `defineRequest` و `defineEventStream` و `defineWebSocket`. يحمل كل أمر `kind` (نوع النقل) و `definition` (مخطط نقطة النهاية) و `input` (بيانات الاستدعاء). يوزّع العميل على منطق النقل الصحيح بناءً على `kind`.

## defineRequest: تعريف نقطة نهاية HTTP

يُعرّف `defineRequest` نقطة نهاية HTTP RESTful. يقبل كائن تعريف ويُرجع منشئ أمر.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### حقول كائن التعريف

| الحقل          | النوع                             | الوصف                                                      |
| -------------- | --------------------------------- | ---------------------------------------------------------- |
| `method`       | `string`                          | طريقة HTTP، مثلاً `GET`، `POST`                            |
| `path`         | `string`                          | مسار URL، يدعم العناصر النائبة `:param`                    |
| `input`        | `AnyStruct \| undefined`          | مدقق Struct للمدخلات                                       |
| `build`        | `RequestBuildHandler`             | يعيّن المدخلات المُحلّلة إلى أجزاء الطلب HTTP              |
| `output`       | `RequestOutputShape \| undefined` | يعيّن رموز الحالة إلى مخططات الاستجابة Struct              |
| `responseType` | `HttpResponseType`                | اختياري، يفرض وضع تحليل الاستجابة (`json`، `text`، `blob`) |

### علاقة input / output / build

1. **input**: يصف البيانات التي يجب على المتصل توفيرها. وقت التنفيذ، يتحقق العميل ويحلّل المدخلات الخام باستخدام `input` Struct.
2. **build**: يستقبل `RequestBuilder` ومدخلات محلّلة (`RequestBuildInput`)، ويعيّن البيانات إلى معاملات المسار ومعاملات الاستعلام والرؤوس والجسم.
3. **output**: يصف استجابات الخادم المحتملة. يختار العميل المخطط المطابق برمز حالة HTTP ويستنتج أنواع النجاح (2xx) والخطأ (غير 2xx).

إذا تم حذف `build`، يجب أيضًا حذف `input`. يقبل الأمر بعد ذلك لا مدخلات ويرسل مباشرة إلى `path`.

إذا تم توفير `build`، يجب أيضًا توفير `input`. هذه قاعدة صارمة في التصميم.

### اختصار لعدم وجود مدخلات

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // لا حاجة لوسيطات
```

### استنتاج نوع المخرج

يدعم `output` كلاً من الشكل المصفوفي والشكل الكائني، مع سلوك مكافئ:

```typescript
// الشكل المصفوفي (موصى به)
output: [
  { status: 200, body: UserSchema },
  { status: [401, 403], body: AuthErrorSchema },
]

// الشكل الكائني
output: {
  200: UserSchema,
  '401': AuthErrorSchema,
  '403': AuthErrorSchema,
}
```

تُكتب نتائج التنفيذ تلقائيًا: تدخل بيانات 2xx إلى فرع النجاح، وكل شيء آخر يدخل فرع الخطأ.

---

## defineEventStream: تعريف دفق SSE

يُعرّف `defineEventStream` نقطة نهاية Server-Sent Events (SSE). يعيّن أسماء الأحداث إلى مخططات Struct لأمان الأنواع على مستوى الحدث.

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### تعيين events

يتوافق كل مفتاح في `events` مع حقل `event` في SSE. يبحث العميل عن المخطط المطابق باسم `event` عند وصول رسالة.

### احتياطي default

إذا أرسل الخادم اسم حدث غير معلَن، يمكنك توفير مخطط `default` كاحتياطي:

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // الأحداث غير المطابقة تُحلّل كسلسلة
  },
})
```

بدون `default`، يُتجاهل الأحداث غير المطابقة. إذا كان هناك اعتراض `onInvalidEvent` مُعدّ، يتلقى إشعارًا.

### SSE مع مدخلات

يستخدم SSE `GET` افتراضيًا. إذا كنت بحاجة لمعاملات استعلام، قدّم مخطط `input` ودالة `build` كما في `defineRequest`:

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

لا يدعم `build` في SSE جسم الطلب أو `withCredentials`.

---

## defineWebSocket: تعريف WebSocket

يُعرّف `defineWebSocket` نقطة نهاية WebSocket، مُميّزًا بين مخططات الرسائل **الواردة** (خادم → عميل) و**الصادرة** (عميل → خادم).

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### مخطط الرسائل الواردة

يُعرّف `incoming` أنواع الرسائل التي يدفعها الخادم. يجب أن تحتوي كل رسالة على حقل `type` يطابق مفتاحًا في `incoming`. إذا كانت الحمولة كائنًا، تُدمج حقوله مع `type`:

```typescript
// الخادم يرسل: { type: 'message', user: 'Alice', text: 'Hi' }
// العميل يستلم: { type: 'message', user: 'Alice', text: 'Hi' }
```

إذا كانت الحمولة قيمة أساسية (سلسلة، رقم، إلخ)، تُغلّف كـ `{ type: 'xxx', data: <value> }`.

### مخطط الرسائل الصادرة

يُعرّف `outgoing` أنواع الرسائل التي يرسلها العميل. يُملأ `type` تلقائيًا من اسم المفتاح. أنت تقدم فقط الحمولة:

```typescript
// الإرسال: { type: 'sendMessage', text: 'Hello' }
// أو: { type: 'sendMessage', data: { text: 'Hello' } }
```

إذا كانت حمولة رسالة صادرة كائنًا، يدعم كلا الشكلين. إذا كانت قيمة أساسية، يجب استخدام `{ type: 'xxx', data: <value> }`.

### WebSocket وارد فقط

إذا لم تكن بحاجة لإرسال رسائل إلى الخادم، احذف `outgoing`:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### قيود build في WebSocket

يدعم `build` في WebSocket فقط `setPathParams` و `setQueryParams`. لا تُدعم عمليات HTTP (الرؤوس، الجسم).

---

## بنية كائن الأمر

بغض النظر عن نوع التعريف، يتبع الأمر المُبنى بنية موحدة:

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// أمر HTTP
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// أمر SSE
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// أمر WebSocket
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` هو وسم نوع النقل. يوزّع `Client.execute` على المنفذ المناسب (HTTP fetch، دفق SSE، اتصال WebSocket) بناءً عليه.

---

## قواعد اختيارية المدخلات (IsInputOptional)

ما إذا كان وسيط منشئ الأمر اختياريًا يُستنتج تلقائيًا بواسطة `IsInputOptional`:

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

القواعد:

1. **لا يوجد `input` مُعرّف**: `TInput` هو `undefined`، الوسيط اختياري بالكامل.
2. **يوجد `input` لكن جميع الحقول اختيارية**: `{} extends EndpointInput<...>` صحيح، الوسيط لا يزال اختياريًا.
3. **يوجد `input` مع حقول مطلوبة**: الوسيط مطلوب.

```typescript
// لا مدخلات — اختياري
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// مدخلات مع جميع الحقول اختيارية — اختياري
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// حقول مطلوبة — مطلوب
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // خطأ TypeScript: مفقود وسيط
C({ body: { name: 'defjs' } }) // OK
```

## ما التالي

- [SSE →](/core/sse) — تنفيذ SSE، إعادة الاتصال، ومعالجة الأحداث
- [WebSocket →](/core/web-socket) — اتصال WebSocket، نبضة القلب، وإدارة الحالة
- [العميل →](/core/client) — إنشاء العملاء واستخدام `execute`
