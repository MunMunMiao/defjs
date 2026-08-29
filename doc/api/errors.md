---
title: Errors
description: RequestError variants and factory helpers.
---

# Errors

HTTP execute returns a discriminated `RequestError` in the tuple’s first slot — not a thrown exception for declared failures.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Switch on `error.kind`: `'http' | 'transport' | 'definition'`.

Every variant is a native `Error` with a stable name, so `String(error)` produces a directly loggable `<name>: <message>`. `kind`, `code`, and variant metadata such as `status`, `response`, and `data` are enumerable own properties. Transport and definition errors use the native, non-enumerable `cause` chain.

```ts
import { StructError, type RequestError } from '@defjs/core'

function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

Call `format()`, `flatten()`, or `prettify()` only after narrowing `error.cause` to `StructError`; those helpers are not copied onto the outer `DefinitionError`.

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

Declared non-2xx status. Undeclared status is **not** this variant — it is `kind: 'definition'` / `UNDECLARED_STATUS`.

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

`UNDECLARED_STATUS` is this variant, not `HttpStatusError`; its `response` and matching numeric `status` are required. Other definition errors may still carry a response, including a Fetch representation on `response.body`; that body is not Struct-decoded as success. `INTERCEPTOR_FAILED` is an interceptor `throw` (not a dead socket).

## Factories

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

`createTransportError` maps abort/timeout sentinels onto `ABORTED` / `TIMEOUT`, everything else to `NETWORK_ERROR`.

The `UNDECLARED_STATUS` overload requires a response and returns that exact union member; the other definition codes keep `response` optional. Calling the factory without a response after bypassing the TypeScript overload (for example from JavaScript or `any`) throws `TypeError('UNDECLARED_STATUS requires a response')`.

All three factories return native `Error` instances with the structured fields above; they do not create plain object errors or require an adapter for `String(error)`.

## Sentinels

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

Shared `cause` / message values for abort and timeout.

See [Errors guide](/core/errors).
