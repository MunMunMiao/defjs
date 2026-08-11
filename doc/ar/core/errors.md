---
title: الأخطاء
description: تعامل مع result tuples الخاصة بكل وسيلة نقل، وفرّع على اتحاد RequestError التمييزي العادي.
---

# الأخطاء

تعيد كل وسيلة نقل مدعومة tuple يبدأ بالخطأ ويتكون من ثلاثة عناصر، لكن العنصر الثالث خاص بوسيلة النقل.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- تعيد HTTP بيانات مفكوكة الترميز وغلاف `HttpResponse` من Defjs.
- يعيد SSE مقبض stream منطقيًا ولقطة فتح عند البدء.
- تعيد WebSocket جلسة منطقية ولقطة اتصال عند البدء.

عند الفشل يكون العنصر الثاني `undefined`. وقد يكون العنصر الثالث أيضًا `undefined` إذا فشل البدء قبل أن تنتج وسيلة النقل اللقطة المقابلة.

## `RequestError`

`RequestError` كائن تمييزي عادي يعاد داخل الـ tuple. وهو لا يرث من الصنف الأصلي `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

اسم الاتحاد المصدّر هو `RequestError<TErrorData>`.

فرّع أولًا على `kind`، ثم على `code` عند الحاجة.

### أخطاء حالة HTTP

تنتج استجابة HTTP معلنة من نوع non-2xx الشكل التالي:

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

يأتي generic الخاص بالبيانات أولًا، ثم generic الخاص بالحالة. يظل `RequestError<TErrorData>` العام مناسبًا لحدود التطبيق، بينما يعيد تنفيذ endpoint اتحادًا من فروع `HttpStatusError<Data, Status>` الخاصة بكل status. لذلك يضيّق فحص `error.status` نوع `error.data` إلى body المعلن لذلك status:

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // في هذا endpoint، تشترك الحالتان المتبقيتان 409 | 422 في conflict body.
    console.error(error.data.conflict)
  }
}
```

يوجد `data` على `HttpStatusError` فقط. حافظ على الاتحاد المرتبط بالـ status عند حد endpoint بدل توسيعه إلى اتحاد بيانات غير مترابط.

### أخطاء النقل

تنتج عملية شبكة فاشلة أو إلغاء أو timeout الشكل التالي:

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

لا تحتوي أخطاء النقل على حقلي `data` أو `response`.

### أخطاء التعريف

قد ينتج فك ترميز input أو بناء الطلب أو فك ترميز response أو التعامل مع حالة HTTP غير معلنة الشكل التالي:

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| الرمز                        | سبب التشغيل الحالي                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | فشل فك الترميز البنيوي للمدخلات، أو فشل إنشاء الطلب، أو أنتج `build` bindings غير صالحة. |
| `RESPONSE_VALIDATION_FAILED` | فشل التحقق البنيوي أو فحص المحتوى لاستجابة معلنة أو استجابة بدء SSE.                     |
| `UNDECLARED_STATUS`          | أعادت HTTP أي status لا يطابق output Struct عندما يكون `output` معلنًا.                  |

ينطبق `UNDECLARED_STATUS` على حالات 2xx وnon-2xx غير المطابقة.

## التفريع

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

لا تسجّل `cause` أو `data` أو response headers أو bodies أو URLs من دون سياسة صريحة لحجب البيانات الحساسة والاحتفاظ بها.

### جسر إلى `Error` الأصلي

تتطلب بعض التكاملات رمي `Error` أصلي. أنشئ diagnostic error جديدًا عند ذلك الحد، ولا تعرض افتراضيًا سوى تصنيفَي `kind` و`code` المستقرين وHTTP `status` المتاح:

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

يحتفظ الخطأ الجديد بـ boundary stack الخاص به. لا يرفق أو ينسخ أبدًا `cause` الخام أو رسالته أو cause stack frames أو `data` أو response headers أو bodies أو request/response URLs. قد تحتوي نصوص stack frame نفسها على URLs وsecrets، لذلك لا يُعد نسخ cause frames منتقاة خيارًا افتراضيًا آمنًا. يتحقق المشروع القابل للتشغيل `examples/observability-redacted-logging` من الاحتفاظ بـ status 404، ومن عدم تسرب response data أو cause stack صُمم ليحمل secret.

## توفر الاستجابة

`HttpResponse` غلاف من Defjs وليس كائن `Response` أصليًا. يعرض status وstatus text وheaders وURL وbody و`error` و`ok`. تعني `ok` فقط أن status ضمن نطاق 2xx، أما `error` فمخصص لفشل transport أو تمثيل body؛ وتتركه استجابة non-2xx العادية فارغًا.

يُفك body صالح ومعلن من نوع non-2xx عبر Struct ويُحفظ typed في `HttpStatusError.data`. أما representation غير الصالح فينتج `RESPONSE_VALIDATION_FAILED` مع استثناء codec الأصلي في `cause` وresponse إذا وصلت، ومن دون `data`.

بالنسبة إلى HTTP:

- يملك خطأ حالة HTTP المعلن `error.response`؛
- قد تملك أخطاء التحقق من output والحالات غير المعلنة `error.response`؛
- قد لا تملك أخطاء التحقق من request أو الإلغاء قبل وصول response أو رمي المعترض أو فشل transport ذي status يساوي 0 أي tuple response.

في SSE، قد يعيد فشل البدء لقطة open في العنصر الثالث إذا وصلت response قبل فشل التحقق من المحتوى أو status. وفي WebSocket، لا يمكن لفشل البدء إعادة لقطة connection إلا إذا التُقطت واحدة.

## مصانع الأخطاء والثوابت

يصدّر root entry دوال factory لاستخدامها في كود التكامل:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- تطبّع `createTransportError(cause)` أسباب الإلغاء وtimeout وغيرها.
- تنشئ `createDefinitionError(code, cause, response?)` خطأ تعريف.
- تنشئ `createHttpStatusError(status, message, response, data?)` خطأ حالة HTTP.
- تمثل `ERR_ABORTED` و`ERR_TIMEOUT` قيمتي `Error` مشتركتين يتعرف عليهما المطبع.

تنشئ هذه الدوال كائنات `RequestError` عادية، ولا ترميها.

تحوّل مسارات الأوامر المدمجة أخطاء البدء المتوقعة إلى tuples. ولا يغطي التعامل مع الـ tuple كود التوسعة الاعتباطي: قد ترمي المعترضات المخصصة وcallbacks الخاصة بالتطبيق، كما يرفض التنفيذ العام عند تمرير أمر غير مدعوم.

## التالي

- تشرح [HTTP](/ar/core/http) توزيع الحالات وفك ترميز response.
- تميّز [SSE](/ar/core/sse) فشل البدء من الأخطاء التي تقع بعد الفتح.
- تغطي [WebSocket](/ar/core/web-socket) أخطاء وقت التشغيل والإغلاق النهائي.
