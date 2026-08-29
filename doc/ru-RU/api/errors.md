---
title: Ошибки
description: Варианты RequestError и фабрики.
---

# Ошибки

HTTP execute кладёт `RequestError` (union по kind) в первый слот кортежа — для объявленных сбоев это не throw.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Ветвись по `error.kind`: `'http' | 'transport' | 'definition'`.

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

Это ответ с объявленным error status. Необъявленный status — не `HttpStatusError`, а `DefinitionError` / `UNDECLARED_STATUS`.

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
      kind: 'definition'
      code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'INTERCEPTOR_FAILED'
      cause?: unknown
      response?: HttpResponse<unknown>
    })
  | (Error & {
      kind: 'definition'
      code: 'UNDECLARED_STATUS'
      cause?: unknown
      response: HttpResponse<unknown>
      status: number
    })
```

Все три варианта — нативные `Error`, поэтому `String(error)` можно писать в лог напрямую. Метаданные Defjs (`kind`, `code`, `status`, `response`, `data`) — собственные перечисляемые свойства; `name` и нативный `cause` не перечисляются. Логгер с поддержкой cause chain может пройти по `cause`.

Struct helpers не копируются на внешний `DefinitionError`. Сначала сузь cause:

```ts
import { StructError, type RequestError } from '@defjs/core'

function logStructCause(error: RequestError): void {
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

## Фабрики

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

`createTransportError` мапит abort/timeout sentinels на `ABORTED` / `TIMEOUT`, всё остальное — на `NETWORK_ERROR`.

Вызов `createDefinitionError` для `UNDECLARED_STATUS` без `response` бросает `TypeError('UNDECLARED_STATUS requires a response')`.

## Сентинелы

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

Общие `cause` / message для abort и timeout.

Подробности — в [гайде Errors](../core/errors.md).
