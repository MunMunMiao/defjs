---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# السياق

تدفق تنفيذ Defjs: يوفر إعداد العميل الإعدادات الافتراضية العالمية؛ تصف تعريفات الأوامر بنية نقطة النهاية؛ يعيّن `build` المدخلات المُحلّلة إلى أجزاء طلب HTTP؛ ويعمل `HttpContext` كأمتعة غير مرئية تُمرّر بين الاعتراضات خلال دورة حياة تنفيذ واحدة.

## تمرير HttpContext

`HttpContext` هو حاوية مفتاح-قيمة تعتمد على Token للبيانات الوصفية ضمن دورة حياة طلب/اتصال واحدة. لا يشارك في تسلسل URL أو الرأس أو الجسم. يقرأه ويكتبه الاعتراضات.

### الإنشاء والاستخدام

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. تعريف Token (مع قيمة افتراضية)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. إنشاء السياق وتعيين القيم
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. التمرير وقت التنفيذ
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### القراءة في الاعتراضات

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### دمج السياقات

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged يحتوي على requestId و auth معًا
```

### واجهة برمجة التطبيقات الرئيسية

| Export                                           | الوصف                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| `makeHttpContextToken<T>(defaultValue: () => T)` | إنشاء Token مع قيمة افتراضية                             |
| `makeHttpContext()`                              | إنشاء سياق فارغ                                          |
| `makeHttpContext(entries)`                       | إنشاء من مصفوفة `[token, value]`                         |
| `makeHttpContext(otherContext)`                  | نسخ سياق آخر                                             |
| `mergeHttpContexts(primary, secondary)`          | دمج سياقين؛ الثانوي يتجاوز الأولي لنفس Token             |
| `ctx.set(token, value)`                          | كتابة قيمة؛ يُرجع self (قابل للتسلسل)                    |
| `ctx.get(token)`                                 | قراءة قيمة؛ يُرجع القيمة الافتراضية للToken إذا لم تُضبط |
| `ctx.has(token) / ctx.del(token)`                | التحقق / الحذف                                           |
| `ctx.keys() / ctx.length`                        | التكرار / العد                                           |

---

## منشئ الطلب وتحليل المدخلات

### تدفق تحليل المدخلات

عند تنفيذ أمر، يعالج العميل المدخلات بالترتيب التالي:

1. **التحقق**: يتحقق ويحلّل بيانات المتصل الخام باستخدام `input` Struct.
2. **البناء**: يستدعي `build(request, parsedInput)` ليعيّن البيانات المُحلّلة إلى أجزاء الطلب.
3. **النقل**: يوزّع على HTTP fetch أو دفق SSE أو اتصال WebSocket بناءً على `kind`.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### مصفوفة قدرات معالج البناء

تدعم وسائل النقل المختلفة عمليات `build` مختلفة:

| طريقة البناء                              | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

يُلقى استخدام طريقة غير مدعومة من وسيلة النقل خطأ `REQUEST_VALIDATION_FAILED` وقت التنفيذ.

### البناء التلقائي

إذا حذفت `build`، يجب أيضًا حذف `input`. لكن يمكنك استخدام شكل `request` في Struct لاستنتاج منطق البناء تلقائيًا:

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // لا حاجة لـ build؛ يقوم الإطار بتعيين المسار/الاستعلام تلقائيًا
})
```

عند توفير `build`، يجب أيضًا توفير `input`. هذه قاعدة صارمة في التصميم.

---

## إعداد العميل

أنشئ عميلًا بـ `createClient` ودالة إعداد واحدة أو أكثر. الدوال اللاحقة تتجاوز السابقة لنفس المفتاح.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### الخيارات الأساسية

#### `withEndpoint(url)`

يضبط عنوان API الأساسي. يتم إلحاق جميع قيم `path` في الطلب بعد هذا URL.

```typescript
withEndpoint('https://api.example.com/v1')
// طلب /users ينتج https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

ما إذا كان يتضمن بيانات الاعتماد عبر النطاقات (ملفات تعريف الارتباط، رؤوس HTTP auth، شهادات TLS العميل). يتوافق مع خيار `credentials` في `fetch`.

```typescript
withCredentials(true) // تضمين ملفات تعريف الارتباط في الطلبات عبر النطاقات
withCredentials(false) // الافتراضي
```

#### `withXSRF(options)`

يضبط سلوك قراءة وحقن رمز XSRF. يقرأ افتراضيًا `XSRF-TOKEN` من `document.cookie` ويحقنه في رأس `X-XSRF-TOKEN`.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // منطق قراءة مخصص، مثلاً من localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| الحقل           | النوع                                  | الافتراضي                 |
| --------------- | -------------------------------------- | ------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`            |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`          |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | يقرأ من `document.cookie` |

#### `withQueryParamsSerializer(fn)`

تسلسل مخصص لمعاملات الاستعلام. يتسلسل افتراضيًا بـ `URLSearchParams.toString()`.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

عند توفير مسلسل مخصص، تسمح طلبات HTTP و SSE بمعاملات استعلام معقدة.

---

## إعداد خاص بوسيلة النقل

### خيارات SSE

اضبط عبر `withSSEOptions` أو دوال إعداد فردية.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| الخيار               | الوصف                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `sse.fetch`          | تنفيذ `fetch` خاص بـ SSE                                                                   |
| `sse.reconnect`      | استراتيجية إعادة الاتصال: محاولات، تأخير، معامل تراجع، اهتزاز، تأخير أقصى، دالة قرار مخصصة |
| `sse.queue`          | طابور الأحداث: سعة قصوى، استراتيجية الانتشار                                               |
| `sse.onInvalidEvent` | مراقب الأحداث غير الصالحة (مخطط مفقود أو فشل التحقق)                                       |
| `sse.maxBufferSize`  | حد حجم المخزن المؤقت الأساسي (بايت)                                                        |

### خيارات WebSocket

اضبط عبر `withWebSocketOptions` أو دوال إعداد فردية.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| الخيار                    | الوصف                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `webSocket.WebSocket`     | منشئ `WebSocket` مخصص                                                                      |
| `webSocket.protocols`     | مصفوفة البروتوكولات الفرعية RFC 6455                                                       |
| `webSocket.beforeConnect` | خطاف ما قبل الاتصال (مثلاً، جلب رمز ديناميكي)                                              |
| `webSocket.heartbeat`     | نبضة القلب: فاصل، مهلة، مصنع رسائل، شرط ACK                                                |
| `webSocket.reconnect`     | استراتيجية إعادة الاتصال: محاولات، تأخير، معامل تراجع، اهتزاز، تأخير أقصى، دالة قرار مخصصة |
| `webSocket.queue`         | طابور الإرسال: سعة قصوى، استراتيجية الانتشار                                               |

### تفاصيل نبضة القلب

تكتشف نبضة قلب WebSocket حيوية الاتصال. إذا تم ضبطها، يرسل الإطار رسائل نبضة قلب كل `intervalMs` وينتظر ACK خلال `timeoutMs`. إذا انتهت مهلة ACK، يُطلَب إعادة الاتصال.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // إرسال نبضة كل 30 ثانية
  timeoutMs: 10000, // يجب استلام ACK خلال 10 ثوانٍ
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- يجب أن يكون نوع رسالة نبضة القلب متوافقًا مع تعريفات `outgoing`.
- `isAck` يحدد ما إذا كانت رسالة واردة هي استجابة نبضة قلب. عندما يُرجع `true`، لا تدخل الرسالة إلى مكرر `receive`.

---

## ترتيب الإعداد وتركيبه

تُطبّق دوال الإعداد بالترتيب؛ اللاحقة تتجاوز السابقة. خيارات وقت التنفيذ (`client.execute(cmd, { timeout: 5000 })`) لها الأولوية القصوى، تليها إعداد مستوى العميل.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// تجاوز إعادة اتصال SSE وقت التنفيذ
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## ما التالي

- [العميل →](/core/client) — إنشاء العميل واستخدام `execute`
- [الأوامر →](/core/commands) — تعريفات الأوامر وقواعد المدخلات الاختيارية
- [SSE →](/core/sse) — تنفيذ SSE، إعادة الاتصال، ومعالجة الأحداث
- [WebSocket →](/core/web-socket) — اتصال WebSocket، نبضة القلب، وإدارة الحالة
- [الاعتراضات →](/core/interceptors) — أنواع الاعتراضات وميكانيكية سلسلة البصل
