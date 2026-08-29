---
title: الأخطاء
description: تنويعات RequestError ومساعدات المصنع.
---

# الأخطاء

تنفيذ HTTP يُرجع `RequestError` مُميَّزًا في الخانة الأولى من الـ tuple — لا استثناءً يُرمى للأعطال المعلَنة. كل تنويعة هي `Error` أصلي: يمكن تسجيل `String(error)` مباشرة، وتبقى metadata الخاصة بـ Defjs قابلة للتعداد، بينما يستخدم `cause` سلسلة الأسباب الأصلية غير القابلة للتعداد.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

فرّع على `error.kind`: `'http' | 'transport' | 'definition'`.

### HttpStatusError {#HttpStatusError}

```ts
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> extends Error {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

حالة غير 2xx معلَنة. الحالة غير المعلَنة ليست هذا التنويع؛ بل `kind: 'definition'` / `UNDECLARED_STATUS`.

### TransportError {#TransportError}

```ts
interface TransportError extends Error {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError {#DefinitionError}

```ts
type DefinitionError =
  | (Error & {
      cause?: unknown
      code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'INTERCEPTOR_FAILED'
      kind: 'definition'
      response?: HttpResponse<unknown>
    })
  | (Error & {
      cause?: unknown
      code: 'UNDECLARED_STATUS'
      kind: 'definition'
      response: HttpResponse<unknown>
      status: number
    })
```

`UNDECLARED_STATUS` هو هذا التنويع، وليس `HttpStatusError`. و`INTERCEPTOR_FAILED` يعني أن معترضًا رمى خطأ، لا أن المقبس انقطع.

مساعدات `format()` و`flatten()` و`prettify()` تخص `StructError` بعد تضييق `cause` فقط؛ لا تُنسخ إلى `DefinitionError` الخارجي:

```ts
import { StructError, type DefinitionError } from '@defjs/core'

function describeDefinitionCause(error: DefinitionError): string | undefined {
  if (error.cause instanceof StructError) {
    return error.cause.prettify()
  }
  return undefined
}
```

## المصانع

## createHttpStatusError() {#createHttpStatusError}

## createTransportError() {#createTransportError}

## createDefinitionError() {#createDefinitionError}

```ts
declare function createHttpStatusError(status: number, message: string, response: HttpResponse<unknown>, data?: unknown): HttpStatusError

declare function createTransportError(cause: unknown): TransportError

declare function createDefinitionError(
  code: 'UNDECLARED_STATUS',
  cause: unknown,
  response: HttpResponse<unknown>,
): Extract<DefinitionError, { code: 'UNDECLARED_STATUS' }>

declare function createDefinitionError(
  code: Exclude<DefinitionError['code'], 'UNDECLARED_STATUS'>,
  cause: unknown,
  response?: HttpResponse<unknown>,
): Extract<DefinitionError, { code: Exclude<DefinitionError['code'], 'UNDECLARED_STATUS'> }>
```

`createTransportError` يعيّن حراس abort/timeout إلى `ABORTED` / `TIMEOUT`، وكل شيء آخر إلى `NETWORK_ERROR`.

`UNDECLARED_STATUS` يحتاج `response`؛ استدعاء factory بدونه يرمي `TypeError`.

## الحراس

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

قيم `cause` / الرسالة المشتركة للإجهاض والمهلة.

انظر [دليل الأخطاء](../core/errors.md).
