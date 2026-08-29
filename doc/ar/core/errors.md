---
title: الأخطاء
description: فرّع على kind وcode لـ 404 والمهلات والحالات غير المعلَنة وأعطال النقل.
---

# الأخطاء

عالج 404 معلَنًا أو مهلة أو حالة غير معلَنة بقراءة الـ tuple الذي يضع الخطأ أولاً — لا بالتقاط throws. يبقى `RequestError` اتحاد `kind` / `code`، وكل قيمة منه `Error` أصلي (`instanceof Error` صحيح). ابدأ بـ `kind`، ثم `code`.

## الإعداد الأساسي

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## الرموز المستقرة

| `kind`       | الرموز                                                                                               | المعنى                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | غير-2xx وصل حد HTTP. يحتفظ بـ `status` و`response` وأي `data` مفكوك خاص بالحالة.   |
| `transport`  | `ABORTED`، `TIMEOUT`، `NETWORK_ERROR`                                                                | إلغاء أو مهلة أو فشل Fetch/نقل منع نتيجة عادية.                                    |
| `definition` | `REQUEST_VALIDATION_FAILED`، `RESPONSE_VALIDATION_FAILED`، `UNDECLARED_STATUS`، `INTERCEPTOR_FAILED` | مدخل أو بناء طلب أو تمثيل استجابة أو فك Struct أو فشل عقد الحالة أو معترض رمى/رفض. |

`cause` اختياري على أخطاء النقل والتعريف. `response` دائمًا على أخطاء حالة HTTP؛ قد يظهر على أخطاء التعريف عندما وُجدت استجابة بالفعل.

## أشكال الـ tuple حسب وسيلة النقل

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

فشل البدء → العنصر الثاني `undefined`. العنصر الثالث فقط عندما أنتجت وسيلة النقل استجابة/لقطة أولاً. بعد إرجاع معالج SSE أو جلسة WebSocket، الأعطال اللاحقة تعيش على دورة حياة ذلك المعالج — لا تعيد كتابة tuple البدء المستقر.

## حالة HTTP والبيانات

الحالة الدقيقة أولاً. مع `output`، Defjs تختار Struct المطابق قبل فك الجسم، فتبقى `error.status` و`error.data` مرتبطتين.

| الموقف                       | نتيجة الـ tuple                   | سلوك الجسم                                                   |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------ |
| 2xx بحالة معلَنة مطابقة      | نجاح                              | Struct المختار → `data`                                      |
| غير-2xx بحالة معلَنة مطابقة  | `HTTP_STATUS`                     | Struct المختار → `error.data` مُنوَّع                        |
| أي حالة بلا إعلان مطابق      | `UNDECLARED_STATUS`               | الحالة تفوز **قبل** فك الجسم                                 |
| حالة مطابقة، فشل تمثيل الجسم | `RESPONSE_VALIDATION_FAILED`      | بلا قيمة مُنوَّعة جزئية                                      |
| `output` محذوف               | 2xx ينجح؛ غير-2xx → `HTTP_STATUS` | الجسم لا يُفك؛ `data` هو `undefined`                         |
| حالة الاستجابة `0`           | خطأ نقل                           | `response.error` → `NETWORK_ERROR` أو `ABORTED` أو `TIMEOUT` |

`HttpResponse.ok` يعني فقط `200 <= status < 300`. غير-2xx العادي لا يضبط `HttpResponse.error` — تلك الخاصية لفشل النقل عند حد Fetch أو فشل تمثيل الجسم.

## البدء مقابل ما بعد الفتح

SSE تتحقق من الحالة و`text/event-stream` والجسم قبل حل المعالج. حالة فاشلة → `HTTP_STATUS`. نوع محتوى سيئ أو جسم مفقود → `RESPONSE_VALIDATION_FAILED`. لقطة الفتح يمكن أن تبقى في الخانة الثالثة من الـ tuple.

بدء WebSocket يغطي المصافحة + أول فتح مادي. فشل المُنشئ أو إغلاق قبل الفتح أو مهلة أو إلغاء → tuple البدء. لقطة اتصال قد توجد حتى لو لم يصل المقبس إلى `open`.

| وسيلة النقل | بعد البدء                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE         | المكرّر يرفض عند خطأ قاتل؛ `stream.closed` يُحل بـ `code: 'error'` و`EventStreamErrorCode`                                                                  |
| WebSocket   | `onRuntimeError` لأعطال الرسالة/الطابور/نبض القلب/وقت التشغيل؛ `receive` يفشل عند أخطاء نهائية؛ `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP        | وعد التنفيذ يستقر مرة. كود المعترض/الاستدعاء يمكن أن يرمي خارج تطبيع الـ tuple                                                                              |

`ABORTED` / `TIMEOUT` يصفان نتيجة البدء التي يراها المستدعي. ما زلت تغلق تدفقًا/جلسة مُرجَعة وتنتظر وعدها النهائي.

## التسجيل وسبب Struct

كل `RequestError` هو `Error` أصلي. استخدم `String(error)` للسلسلة المستقرة `<name>: <message>`، واستخدم `kind` و`code` و`status` و`response` و`data` القابلة للتعداد للسجلات المهيكلة. `cause` هو رابط سلسلة الأسباب الأصلي وغير قابل للتعداد؛ لا تنسخ مساعدين منه إلى الخطأ الخارجي.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.format(), error.cause.flatten(), error.cause.prettify())
  }
}
```

استدعِ `format()` و`flatten()` و`prettify()` فقط بعد التحقق من `error.cause instanceof StructError`. يبقى الـ tuple الموحّد كما هو؛ تحسين التسجيل لا يحوّل الأعطال المعلنة إلى throw.

## المرجع

| الفرع               | فحص تدفق التحكم                              | حقول مستقرة مفيدة                        | عادة غائبة / حسّاسة               |
| ------------------- | -------------------------------------------- | ---------------------------------------- | --------------------------------- |
| سياسة حالة HTTP     | `error.kind === 'http'`                      | `error.status`، `error.data` مراجع       | الجسم، الرؤوس، URL، `cause`       |
| إلغاء المستدعي      | `kind === 'transport' && code === 'ABORTED'` | `kind`، `code`                           | سبب الإلغاء والمكدس               |
| المهلة              | `kind === 'transport' && code === 'TIMEOUT'` | `kind`، `code`                           | URL الطلب والسبب الأساسي          |
| فشل العقد           | `error.kind === 'definition'`                | `kind`، `code`، `response?.status` مراجع | مشاكل Struct، الجسم، قيم المدخل   |
| وقت تشغيل تدفق/جلسة | `stream.closed` / `session.closed`           | رمز/نوع نهائي، حالة إغلاق مراجعة         | حمولات الأحداث، الإطارات، الأسباب |

لا تستنتج CORS من الحالة `0` — فرّع على `kind` و`code`.

عامل `cause` و`data` ورؤوس/أجسام الاستجابة وعناوين URL ومشاكل Struct وقيم المدخل والمكدسات كحسّاسة. ملخص محافظ:

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError` و`createDefinitionError` و`createHttpStatusError` تبني وتعيد نسخ `Error` أصلية. أعطال الطلب العادية تبقى في الـ tuple الموحّد؛ هوية `Error` الأصلية لا تحوّلها بحد ذاتها إلى throw. `ERR_ABORTED` و`ERR_TIMEOUT` أسباب مشتركة يتعرّف عليها مُطبّع النقل.

## وصفات ذات صلة

- [GET مع 404 معلَن](../recipes/get-declared-404.md)
- [إلغاء استدعاء HTTP](../recipes/cancel-http.md)
