---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

استخدم `defineRequest` لتعريف نقطة نهاية HTTP، ثم نفّذها بـ `Client.execute()`. تتولى الحزمة الأساسية التحقق من المخطط وتوزيع رموز الحالة ودمج الإشارات وتحليل جسم الاستجابة تلقائيًا.

## تعريف نقطة نهاية

يقبل `defineRequest` كائن تعريف يحتوي على `method` و `path` و `input` (اختياري) و `output` (اختياري) و `build` (اختياري).

عند توفير `input`، يجب أيضًا توفير `build` لوصف كيفية تعيين حقول المدخلات إلى أجزاء الطلب (معاملات المسار، معاملات الاستعلام، الرؤوس، الجسم).

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

إذا لم تكن بحاجة لمدخلات، احذف كلاً من `input` و `build`:

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## تعيين المخرجات برمز الحالة إلى المخطط

يعيّن `output` رموز حالة HTTP إلى مخططات. يختار وقت التشغيل المخطط المطابق برمز حالة الاستجابة.

يدعم كلاً من الشكل الكائني والشكل المصفوفي:

```typescript
import { defineRequest, object, string } from '@defjs/core'

// الشكل الكائني: المفاتيح هي رموز الحالة، والقيم هي مخططات
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// الشكل المصفوفي: يدعم تعيين رموز حالة متعددة إلى نفس المخطط
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

إذا أرجع الخادم رمز حالة غير معلَن في `output`، يفشل الطلب بـ `DefinitionError` برمز `UNDECLARED_STATUS`.

## استنتاج أنواع بيانات النجاح/الخطأ

يدفع `output` استنتاج نوع TypeScript. يُرجع `Client.execute()` `HttpAwaitResult` الذي يميّز تلقائيًا بين بيانات نجاح 2xx وبيانات خطأ غير 2xx.

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result مكتوب كـ { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data مكتوب كـ { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### مساعدو الأنواع

- `RequestSuccessData<TOutput>`: يستخرج جميع أنواع مخرجات مخطط 2xx من `output`. إذا لم يكن هناك تعيين 2xx، يُستنتج كـ `unknown`.
- `RequestErrorData<TOutput>`: يستخرج جميع أنواع مخرجات مخطط غير 2xx من `output`. إذا لم يكن هناك تعيين غير 2xx، يُستنتج كـ `unknown`.

## تنفيذ طلب

استدعِ `Client.execute()` مع أمر. الوسيط الثاني اختياري `HttpExecuteOptions`:

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* سياق مخصص يمكن للاعتراضات قراءته */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // alias، مكافئ لـ abort
})
```

النتيجة المُرجعة `HttpAwaitResult` هي ثلاثية:

| الموضع | النوع                                    | المعنى                                                      |
| ------ | ---------------------------------------- | ----------------------------------------------------------- |
| 0      | `RequestError<TErrorData> \| null`       | كائن الخطأ؛ `null` عند النجاح                               |
| 1      | `TSuccess \| undefined`                  | بيانات النجاح؛ `undefined` عند الفشل                        |
| 2      | `SettledResponse<TSuccess> \| undefined` | غلاف الاستجابة الخام مع `status` و `headers` و `body`، إلخ. |

## الإلغاء والمهلة

تتحكم `abort` و `timeout` و `signal` في دورة حياة الطلب. **لا يمكن استخدام `abort` و `timeout` معًا** — يُنتج ذلك خطأ تحقق قبل إرسال الطلب.

### استخدام AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// الإلغاء لاحقًا
controller.abort()

// بعد الإلغاء، error.kind هو 'transport'، code هو 'ABORTED'
```

### استخدام المهلة

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // مهلة 5 ثوانٍ
})

// بعد المهلة، error.kind هو 'transport'، code هو 'TIMEOUT'
```

### دمج الإشارات الخارجية

إذا مُرّر كلاً من `abort` و `signal`، يدمج الإطار الإشارات إلى `AbortSignal` واحد. `timeout` يشارك أيضًا كـ `AbortSignal.timeout()`. أي إشارة تُطلِب إيقاف الطلب.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // مدمج مع abort
})
```

### تمييز الأخطاء

الإلغاء والمهلة كلاهما `TransportError`، يمكن تمييزهما بـ `error.code`:

| السيناريو  | `error.code`    | الوصف                                             |
| ---------- | --------------- | ------------------------------------------------- |
| إلغاء يدوي | `ABORTED`       | `controller.abort()` أو إشارة خارجية تُفعل        |
| مهلة       | `TIMEOUT`       | `timeout` انتهى، أو `AbortSignal.timeout()` تُفعل |
| فشل شبكة   | `NETWORK_ERROR` | استثناءات أخرى من fetch                           |

## تقدم التحميل/الرفع

تتبع التقدم عبر `onDownloadProgress` و `onUploadProgress`.

### تقدم التحميل

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

يحتوي `HttpProgressEvent` على ثلاثة حقول:

- `lengthComputable`: ما إذا أرجع الخادم `Content-Length`
- `loaded`: البايتات المستلمة حتى الآن
- `total`: إجمالي البايتات (صالح فقط عندما `lengthComputable` هو `true`)

### تقدم الرفع

تعمل ميزة تقدم الرفع فقط عندما يكون جسم الطلب `ReadableStream<Uint8Array>`. يغلّف الإطار الدفق ويستدعي رد الاتصال بعد كل قطعة.

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## أنواع الاستجابة

افتراضيًا، إذا كان `output` معلَنًا، يحلّل الإطار الاستجابة تلقائيًا كـ `json`. يمكنك تجاوز ذلك بـ `responseType`، أو تحديده عندما يكون `output` هو `undefined`.

```typescript
import { defineRequest } from '@defjs/core'

// نوع استجابة صريح
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// لا مخرجات، يهمّك فقط الاستجابة الخام
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

القيم المدعومة لـ `responseType`:

| القيمة        | الوصف                                                   |
| ------------- | ------------------------------------------------------- |
| `json`        | قراءة النص ثم `JSON.parse()`؛ الجسم الفارغ يُرجع `null` |
| `text`        | إرجاع سلسلة النص مباشرة                                 |
| `blob`        | إرجاع `Blob`                                            |
| `arraybuffer` | إرجاع `ArrayBuffer`                                     |

عندما يكون `responseType` هو `json` ويُعرّف `output` مخططًا لرمز الحالة المُرجع، يتحقق الإطار من JSON المحلّل مقابل المخطط. إذا فشل التحقق، يُرجع `DefinitionError` برمز: `RESPONSE_VALIDATION_FAILED`.

## ما التالي

- [العميل →](/core/client) — إنشاء `Client`، الاعتراضات، XSRF، الخيارات العالمية
- [SSE →](/core/sse) — الأحداث المرسلة من الخادم والاستجابات المتدفقة
- [WebSocket →](/core/web-socket) — التواصل في الوقت الحقيقي ثنائي الاتجاه
