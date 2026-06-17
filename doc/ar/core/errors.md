---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# الأخطاء

تُرجع جميع نتائج التنفيذ في `@defjs/core` كثلاثيات `[error, result, response]`. `error` هو `RequestError`: اتحاد تمييزي بـ `kind` و `code`. التفريع بـ `kind` و `code` هو النمط الموصى به بدلاً من مقارنة السلاسل.

## بنية RequestError

`RequestError` هو اتحاد ثلاثة أنواع أخطاء:

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

تشارك جميع الأخطاء هذه الحقول المشتركة:

| الحقل      | النوع                                   | الوصف                                                   |
| ---------- | --------------------------------------- | ------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | فئة الخطأ للتفريع على المستوى الأعلى                    |
| `code`     | `string`                                | رمز خطأ دقيق للتفريع على المستوى الثاني                 |
| `message`  | `string`                                | وصف الخطأ مقروء للبشر                                   |
| `data`     | `unknown`                               | بيانات إضافية (فقط لأخطاء `http` و `definition`)        |
| `response` | `SettledResponseLike`                   | كائن الاستجابة الخام (فقط لأخطاء `http` و `definition`) |

### HttpStatusError

يُنتج عندما يُرجع الخادم رمز حالة غير 2xx مُعرّف في `output`.

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

يُستنتج نوع `data` من مخطط `output` لرمز الحالة المطابق. على سبيل المثال، `output: { 404: notFoundStruct }` يضيّق `error.data` إلى النوع المُستنتج من `notFoundStruct`.

### TransportError

يُنتج عند فشلات شبكة أو طبقة النقل، بما في ذلك الإيقاف والمهلة والأخطاء العامة.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

يُنتج عند فشل التعريف أو التحقق من الطلب.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| الرمز                        | سيناريو التفعيل                                                          |
| ---------------------------- | ------------------------------------------------------------------------ |
| `REQUEST_VALIDATION_FAILED`  | فشلت معاملات الإدخال في التحقق من `input` struct، أو رمى `build` استثناء |
| `RESPONSE_VALIDATION_FAILED` | فشل جسم الاستجابة في التحقق من `output` struct لرمز الحالة المُرجع       |
| `UNDECLARED_STATUS`          | أرجع الخادم رمز حالة 2xx غير معلَن في `output`                           |

## تصنيف الأخطاء والتفريع

**لا تستخدم** مقارنة السلاسل للحكم على أنواع الأخطاء:

```typescript
// غير موصى به: هش ولا يضيّق النوع
if (error.message.includes('timeout')) { ... }
```

**موصى به**: تفريع بـ `kind` و `code` للتضييق الدقيق للنوع:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error يُضيّق إلى HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data يُضيّق إلى { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error يُضيّق إلى TransportError
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      // error يُضيّق إلى DefinitionError
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## الثوابت المدمجة

يُصدّر `@defjs/core` ثابتين لتحديد أخطاء نقل محددة:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: تم إلغاء الطلب بشكل فعّال
// ERR_TIMEOUT: انتهت مهلة الطلب
```

### تفعيل الإلغاء في الاعتراضات

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### الاستخدام مع AbortController

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### إنشاء أخطاء نقل يدويًا

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## دوال مساعدة

### `createTransportError`

يُسوّي استثناء خام إلى `TransportError`.

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

يُسوّي استثناء خام إلى `DefinitionError`.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

يُسوّي استجابة غير 2xx إلى `HttpStatusError`.

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## ما التالي

- [العميل →](/core/client) — إنشاء العملاء وتنفيذ الأوامر
- [طلبات HTTP →](/core/http) — `defineRequest` وأنماط المخرجات
- [SSE →](/core/sse) — أخطاء SSE واستراتيجيات إعادة الاتصال
- [WebSocket →](/core/web-socket) — معالجة أخطاء اتصال WebSocket
