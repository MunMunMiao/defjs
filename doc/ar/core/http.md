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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
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
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
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

## كيف يُقرأ الجسم

`output` هو Struct واحد لجسم 2xx؛ و`error` هو Struct واحد لكل ما عداه. فإذا أُعلن أحدهما ولم يُذكر `responseType`، كان التمثيل الافتراضي `json`. والأنواع الصريحة: `json`، `text`، `blob`، `arraybuffer`. وإذا لم يُعلن أيٌّ منهما فلا يُسمح بـ `responseType` ولا يُقرأ الجسم أبدًا.

ترتيب العمليات:

1. `ok` يختار الطرف: `output` لـ 2xx، و`error` لكل ما عداه. لا الاثنان معًا أبدًا.
2. لا شيء معلَن لذلك الطرف → لا يُقرأ الجسم أبدًا. فـ 2xx ينجح مع `data === undefined`؛ وغير-2xx يكون `HTTP_STATUS` مع `data === undefined`. وجسم غير قابل للقراءة في طرف لم تُعلنه يُهمَل، بما في ذلك كونه غير قابل للقراءة.
3. يُفحَص نوع الوسائط **قبل** قراءة الجسم. وأي عدم تطابق هو `RES_MEDIA_TYPE_INVALID`، فلا يُحلَّل شيء ولا يُفكّ.
4. يُقرأ التمثيل. والفشل هو `RES_DECODE_FAILED`.
5. يحلّل Struct القيمة. والفشل هو `RES_STRUCT_MISMATCH`.
6. 2xx → نتيجة و`response.body` مُنوَّع؛ وغير-2xx → `data` مُنوَّع على `HTTP_STATUS`.

الفكّ يحدث مرة واحدة بعد سلسلة المعترضات، فالاستجابة التي بناها معترض بـ `makeResponse(...)` تُقرأ تمامًا كتلك القادمة من الشبكة.

الاستجابة الناجحة هي `DecodedResponse<T>`: `url` و`status` و`statusText` و`headers` و`ok`، مع `body` مُنوَّع. وحيث لم يُفكَّ شيء تحصل على `HttpMeta` — الحقول نفسها بلا `body`. و`ok` يعني فقط `200 <= status < 300`. وليس أيٌّ منهما كائن `Response` الأصلي. وفشل النقل خطأ (fault)، فلا توجد استجابة بحالة صفر تنوب عنه.

## ألغِ العمل {#cancel-the-work}

خيارات التنفيذ تأخذ `signal` مع إما `abort` أو `timeout`. **`abort` و`timeout` متنافيان.** يمكن لـ `signal` أن يجتمع مع أي منهما.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

يجب أن يكون `timeout` عددًا صحيحًا آمنًا موجبًا في `1..2_147_483_647`. إلغاء معروف → `NET_ABORTED`؛ مهلة التنفيذ → `NET_TIMEOUT`؛ أعطال Fetch/معترض أخرى → `NET_UNREACHABLE`. الإلغاء بعد قبول الخادم لكتابة **لا** يثبت أن الكتابة تراجعت.

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
