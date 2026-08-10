---
title: HTTP
description: ابنِ URLs وأجسام HTTP، ووزّع response Structs، وألغِ العمل، واضبط credentials وXSRF، وافهم حد Fetch منخفض المستوى.
---

# HTTP

تنشئ `defineRequest(...)` منشئ أمر HTTP. تغطي [الأوامر](/ar/core/commands) التعريفات وإسقاطات input؛ أما هذه الصفحة فتملك سلوك HTTP على wire ودورة حياته.

## بناء URL

يجب أن تقدّم `withEndpoint(...)` عنوان URL أساسيًا مطلقًا. ويُحفظ path الخاص به كدليل:

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

تُضاف شرطة مائلة أخيرة إلى base path إذا كانت مفقودة. ويُهمل أي query أو hash على base endpoint.

قيم `path` في نقطة النهاية paths نسبية ضمن العقد. يُقبل أول slash ويُحذف قبل resolution، لذلك لا يستبدل base directory. يرفض وقت التشغيل:

- عناوين URL المطلقة والعناوين protocol-relative؛
- paths التي تحتوي `?`؛
- paths التي تحتوي `#`.

تستخدم placeholders في path الشكل `:name`:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

مرّر قيم placeholders الخام. يحوّل Defjs كل قيمة scalar إلى نص، ويرفض القيمة الفارغة أو القيمة الكاملة `.` أو `..`، ثم يطبّق `encodeURIComponent` مرة واحدة بالضبط قبل الاستبدال. تبقى `/` و`?` و`#` و`%` والمسافات وUnicode ضمن path segment واحد. لا تُجرِ encoding مسبقًا؛ إذ تُعامل `%` كمدخل خام وتُرمّز إلى `%25`.

## ترميز الطلب

استخدم `struct.request(...)` للربط المباشر مع wire:

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

تختار Body Structs الترميز و`Content-Type` الافتراضي:

| Body Struct                | جسم wire              | `Content-Type` الافتراضي                          |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | string                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | تضبطه المنصة، بما فيه boundary                    |
| `struct.blob()`            | `Blob`                | نوع Blob أو `application/octet-stream`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

يستطيع `build` مخصص استخدام دوال HTTP builder المقابلة. تستبدل دوال setter جزء الطلب، بينما تُلحق `addHeaders` و`addFormData` و`addFormUrlEncoded` بالجزء الحالي. يجب أن تأتي كل القيم من الإسقاط المرتبط بالـ Struct.

### قيم Query

يقبل query encoder الافتراضي قيمًا scalar مسطحة ومصفوفات من القيم scalar. وتفشل الكائنات المتداخلة أثناء بناء الطلب.

تستطيع `withQueryParamsSerializer((params, rawParams) => string)` تغيير طريقة عرض القيم المسطحة المقبولة أصلًا. تستقبل view من `URLSearchParams` والـ record المسطح بعد الترميز. ولا تجعل nested query objects صالحة؛ فهي تُرفض قبل استدعاء serializer.

تتحول aliases إلى مفاتيح query وpath وheader صادرة. ويستمر كود المستدعي في استخدام أسماء حقول Struct المنطقية.

## Status وفك ترميز Output

يربط `output` status codes بـ response Structs:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

يختار وقت التشغيل Struct باستخدام status المطابق حرفيًا. ينتج أي status غير مطابق `UNDECLARED_STATUS` عندما يكون `output` معلنًا. تشكل أجسام 2xx المعلنة اتحاد بيانات النجاح، وتشكل أجسام non-2xx المعلنة `error.data`.

تعني `response.ok` فقط `status >= 200 && status < 300`. ولا تعني نجاح فك ترميز output أو تحقق قواعد التطبيق أو authorization.

عندما يكون `output` معلنًا ويُحذف `responseType`، يكون parsing الافتراضي للاستجابة `json`. الأنماط الصريحة هي `json` و`text` و`blob` و`arraybuffer`. بعد ذلك يجري Struct المختار فك الترميز البنيوي. وعند حذف `output` لا يُقبل `responseType`، وتكون result data مساوية لـ `undefined`، ويحمل غلاف response المعاد `body: null`. يحاول runtime إلغاء body للاستجابة بأفضل جهد بدلًا من قراءته أو فك ترميزه.

يتبع تصنيف نتيجة الأمر أولوية ثابتة: فشل transport عند status يساوي 0 → عدم وجود `output` → مطابقة status حرفيًا أو `UNDECLARED_STATUS` → `response.error` → فك Struct. لذلك لا تحدث أخطاء تمثيل body إلا عند إعلان `output`؛ وتظل حالة status غير المعلن متقدمة إذا سجّل Fetch مثل هذا الخطأ.

### أخطاء تمثيل body

بالنسبة إلى output معلن ومطابق حرفيًا، إذا فشل JSON أو codec آخر للـ body، يحتفظ Fetch بالاستثناء الأصلي في `HttpResponse.error`. يتوقف تنفيذ الأمر قبل تطبيق output Struct ويعيد `[RESPONSE_VALIDATION_FAILED, undefined, response]`؛ يبقى الاستثناء في `cause` ولا تُنشأ `error.data` typed.

لا تملأ استجابة non-2xx العادية `response.error`؛ يمثلها `status` و`ok`. وعندما يكون status non-2xx وbody معلنين وصالحين، يفك Struct الجسم ويحتفظ خطأ `HTTP_STATUS` الناتج بالبيانات typed داخل `error.data`.

## نتيجة HTTP

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

عند النجاح تكون `response` غلاف `HttpResponse` من Defjs ويطابق body الخاص بها `data`. وعند الفشل يعتمد توفر response على المرحلة التي بلغها التنفيذ. راجع [الأخطاء](/ar/core/errors) للتصنيف الدقيق.

## الإلغاء وTimeout

يقبل تنفيذ HTTP الحقول `abort` و`signal` و`timeout`:

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

يُدمج `signal` مع signal الداخلي للعميل ومع timeout موجب. حقل `abort` المنفصل هو إشارة إلغاء بديلة يحتفظ بها الـ API الحالي. لا يمكن تمرير `abort` و`timeout` معًا؛ يؤدي ذلك إلى `REQUEST_VALIDATION_FAILED`. ويمكن دمج `signal` مع أي منهما.

يجب أن تكون قيمة `timeout` لتنفيذ HTTP وSSE وWebSocket عددًا صحيحًا موجبًا وآمنًا ضمن `1..2_147_483_647`؛ وتؤدي القيم `0` أو السالبة أو الكسرية أو `NaN` أو `Infinity` أو التي تتجاوز الحد إلى `REQUEST_VALIDATION_FAILED` قبل إنشاء أي مورد request أو stream أو socket.

ينتج الإلغاء المعروف `ABORTED`. وينتج سبب `AbortSignal.timeout(...)` أو execution timeout الرمز `TIMEOUT`. وتنتج إخفاقات Fetch الأخرى `NETWORK_ERROR`.

## Credentials وXSRF

تضبط `withCredentials(true)` قيمة Fetch `credentials: 'include'` في HTTP وSSE. تترك `false` خيار Fetch غير محدد؛ ولا تفرض `omit`. لا يضيف هذا الإعداد header من نوع `Authorization` ولا يضبط مصادقة WebSocket.

تطبق `withXSRF(...)` على طلبات HTTP فقط. القيم الافتراضية هي:

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

تُحاول عملية الحقن فقط مع `POST` و`PUT` و`PATCH` و`DELETE`. ويُحفظ configured header موجود مسبقًا. يقتصر البحث في browser cookies على طلبات same-origin. خارج المتصفح، قدّم `tokenProvider` متزامنًا؛ وله الأولوية على cookie lookup.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

أبقِ token providers على الخادم ضمن نطاق الطلب. لا تجعل `withCredentials(true)` cookies عبر origins قابلة للقراءة من JavaScript، ولا تؤدي إلى حقن XSRF header عبر origins.

## مراقبو التقدم

يبلغ `onDownloadProgress` عن bytes أثناء قراءة Fetch response body. تكون `lengthComputable` مساوية لـ true فقط عند توفر `Content-Length` موجب.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

لا يراقب `onUploadProgress` إلا request body من نوع `ReadableStream<Uint8Array>`. تعرض منشئات الأوامر عالية المستوى الحالية setters لإسقاط Blob وArrayBuffer، لكنها لا تعرض setter لـ raw stream. لذلك لا يوجد مثال قياسي باستخدام `defineRequest` يستطيع توفير الـ stream الذي يتطلبه هذا الخيار. لا تعرض stream منشأ يدويًا على أنه body صالح لأمر عالي المستوى.

تعمل progress callbacks في مسار قراءة أو كتابة النقل. اجعلها سريعة ولا تسمح لها بالرمي.

## حد Fetch منخفض المستوى

الدالة `fetchHandler(httpRequest, fetchImpl?)` مصدّرة. تحوّل `HttpRequest` من Defjs إلى `Request` أصلي، وتستدعي Fetch، وتفك تمثيل response المختار، ثم تعيد غلاف `HttpResponse` من Defjs. تتحول إخفاقات Fetch إلى أغلفة status فيها يساوي 0.

يتجاوز استدعاء `fetchHandler` مباشرة:

- فك ترميز command input وإسقاط الطلب؛
- توزيع status في HTTP output وفك ترميز Struct؛
- تنسيق معترضات العميل؛
- التحويل إلى tuple `RequestError` عالي المستوى.

إنه حد منخفض المستوى مصدّر، وليس مسار الأوامر الموصى به. لم يُحسم التزام استقراره طويل المدى هنا.

## التالي

- تغطي [المعترضات](/ar/core/interceptors) نسخ الطلبات وshort-circuit وretry.
- توثّق [الأخطاء](/ar/core/errors) فشل HTTP status والنقل والتعريف.
- تشرح [Struct](/ar/core/struct) فك الترميز البنيوي الصارم.
