---
title: HTTP
description: عرّف طلبًا، نفّذه، فرّع على الحالة، وألغِ بـ signal أو timeout.
---

# HTTP

عرّف → نفّذ → فرّع على الـ tuple → ألغِ عندما تختفي الشاشة. هذه حلقة HTTP كاملة.

## الإعداد الأساسي

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## حل عنوان URL

`withEndpoint(...)` يحتاج URL مطلقًا صالحًا. مسار نقطة النهاية يبقى كدليل؛ الاستعلام والـ hash يُهملان قبل حل الأمر.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

عناصر نائبة للمسار قيم قياسية خام، تُرمَّز مرة واحدة بالضبط. القيم الفارغة و`.` / `..` مرفوضة. الشرطات المائلة و`?` و`#` و`%` والمسافات ويونيكود في عنصر نائب واحد تبقى مقطعًا مرمَّزًا واحدًا — لا ترمّز مسبقًا.

مسار التعريف لا يمكن أن يحتوي `?` أو `#`، ولا يمكن أن يكون مطلقًا أو نسبيًا بالبروتوكول. مرمّز الاستعلام الافتراضي يقبل القيم القياسية ومصفوفات القيم القياسية. قيم الاستعلام المتداخلة/المعقدة تحتاج `withQueryParamsSerializer(...)` وإلا يفشل البناء.

## رمّز المدخل

`struct.request(...)` يبقي path وquery وheaders وbody منفصلة. غلاف الجسم يختار الترميز ونوع المحتوى:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

الأسماء المستعارة تعيد كتابة مفاتيح السلك الصادرة فقط. القيم المحلَّلة ومدخلات الأمر تبقي الأسماء المنطقية.

| الغلاف                     | جسم وقت التشغيل   | نوع المحتوى الافتراضي                                 |
| -------------------------- | ----------------- | ----------------------------------------------------- |
| `struct.json(inner)`       | سلسلة JSON        | `application/json`                                    |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                            |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`     |
| `struct.formData(shape)`   | `FormData`        | حد multipart للمنصة؛ Defjs تمسح `Content-Type` القديم |
| `struct.blob()`            | `Blob`            | نوع Blob أو `application/octet-stream`                |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                            |

`build` المخصص يعرض نفس معيّنات الموقع/الترميز. كتابة الجسم النهائية تفوز (القيمة + بيانات تعريف نوع المحتوى). الأوامر عالية المستوى لا تحوّل كائنًا عشوائيًا إلى جسم — أعلن غلافًا أو استخدم المعيّن المطابق.

## وزّع حسب الحالة

`output` خريطة حالة → Struct أو `{ status, body }[]`. مع `output` وبلا `responseType`، التمثيل الافتراضي `json`. الأنواع الصريحة: `json`، `text`، `blob`، `arraybuffer`.

ترتيب العمليات:

1. الحالة `0` → خطأ نقل.
2. بلا `output` → 2xx ينجح مع `data === undefined`؛ غير-2xx → `HTTP_STATUS` مع `error.data === undefined`. الجسم لا يُفك.
3. مع `output`، الحالة المعلَنة الدقيقة تختار Structها. شكل المصفوفة: تطابق لاحق يتجاوز تطابقًا مجمّعًا سابقًا.
4. حالة غير معلَنة → `UNDECLARED_STATUS` **قبل** فك الجسم.
5. فشل التمثيل → `RESPONSE_VALIDATION_FAILED`، بلا بيانات جزئية.
6. 2xx معلَن مفكوك → نتيجة؛ غير-2xx معلَن مفكوك → `error.data` مُنوَّع على `HTTP_STATUS`.

`HttpResponse` يملك `url` و`status` و`statusText` و`headers` و`body` و`error` و`ok`. `ok` يعني فقط `200 <= status < 300`. قيمة Defjs، وليست `Response` أصليًا. بلا `output`، `responseType` غير مسموح.

## ألغِ العمل

خيارات التنفيذ تأخذ `signal` مع إما `abort` أو `timeout`. **`abort` و`timeout` متنافيان.** يمكن لـ `signal` أن يجتمع مع أي منهما.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

يجب أن يكون `timeout` عددًا صحيحًا آمنًا موجبًا في `1..2_147_483_647`. إلغاء معروف → `ABORTED`؛ مهلة التنفيذ → `TIMEOUT`؛ أعطال Fetch/معترض أخرى → `NETWORK_ERROR`. الإلغاء بعد قبول الخادم لكتابة **لا** يثبت أن الكتابة تراجعت.

## بيانات الاعتماد وXSRF

`withCredentials(true)` يضبط Fetch `credentials: 'include'` لـ HTTP وSSE. لا ينشئ `Authorization` ولا يضبط مصادقة WebSocket. `false` يترك بيانات الاعتماد غير محددة.

`withXSRF(...)` لـ HTTP فقط. الافتراضات: `cookieName: 'XSRF-TOKEN'`، `headerName: 'X-XSRF-TOKEN'`. الرأس يُحقن فقط للطرق غير الآمنة، فقط عندما لم يضبطه المستدعي بالفعل، وفقط لطلبات المتصفح من نفس الأصل. يتخطى `GET` و`HEAD` و`OPTIONS` و`TRACE`. خارج المتصفح، مرّر `tokenProvider` متزامنًا محدودًا بالطلب إن احتجت الحقن.

أبقِ بيانات الاعتماد ورموز XSRF وسلاسل الاستعلام خارج السجلات الروتينية. لا تستخدم معاملات الاستعلام كقناة اعتماد عامة.

## التقدّم وحد Fetch

`onDownloadProgress` يعمل أثناء قراءة تمثيل استجابة صريح. `lengthComputable` صحيح فقط مع `Content-Length` موجب. بلا `responseType` → بلا فك جسم → بلا تقدّم قراءة الجسم.

`onUploadProgress` يراقب جسم طلب `ReadableStream<Uint8Array>` بينما يقرأه Fetch. أغلفة الجسم العادية لا تعرض معيّن تدفق خام — تقدّم الرفع أساسًا للبناء منخفض المستوى.

`fetchHandler(httpRequest, fetchImpl?)` هو حد Fetch الأدنى: يبني `Request` أصليًا، يستدعي Fetch، يقرأ التمثيل، يُرجع `HttpResponse`. **لا** يتحقق من مدخل الأمر، ولا يوزّع `output`، ولا يشغّل المعترضات. مفيد لاختبارات النقل المحقونة — وليس بديلاً عن `client.execute`.

## حدود إعادة التشغيل

Defjs **لا** تعيد محاولة HTTP تلقائيًا. إعادة محاولة قراءة ما زالت تحتاج سياسة مهلة/شبكة/تكرار مراجعة. إعادة محاولة طفرة تحتاج بايتات قابلة لإعادة التشغيل، ودعم الخادم، ومفتاح تكرار آمن مربوط بنطاق المصادقة + بايتات الطلب، وسياسة تكرار للمستقبل.

حد عميل/أمر/Fetch لا يمكنه معرفة إن اكتملت كتابة فاشلة. أبقِ قرارات إعادة التشغيل في التطبيق أو معترض مراجع. المعترضات يمكنها القطع القصير أو استبدال الطلب منخفض المستوى؛ الحالة والجسم النهائيان يجب أن يرضيا عقد الأمر.

## وصفات ذات صلة

- [GET مع 404 معلَن](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [إلغاء استدعاء HTTP](../recipes/cancel-http.md)
- [الاختبار بـ Fetch محلي](../recipes/test-with-handle.md)
