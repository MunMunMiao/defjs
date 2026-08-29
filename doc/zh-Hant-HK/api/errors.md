---
title: Errors
description: RequestError variants 同 factory helpers。
---

# Errors

HTTP execute 會喺 tuple 第一格 return discriminated `RequestError` — declared failures 唔會 throw exception。

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Switch `error.kind`：`'http' | 'transport' | 'definition'`。

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

呢個係 declared error status 嘅 response。Undeclared status 唔係 `HttpStatusError`，而係 `DefinitionError` / `UNDECLARED_STATUS`。

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

三個 variants 都係 native `Error`，可以直接記錄 `String(error)`。`kind`、`code`、`status`、`response`、`data` 呢啲 Defjs metadata 係 enumerable own properties；`name` 同 native `cause` 唔會被 enumerate。支援 cause chain 嘅 logger 可以繼續沿住 `cause` 記錄。

Struct helpers 唔會 copy 去外層 `DefinitionError`；一定要先 narrow cause：

```ts
import { StructError, type RequestError } from '@defjs/core'

function logStructCause(error: RequestError): void {
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

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

`createTransportError` 會將 abort/timeout sentinels map 去 `ABORTED` / `TIMEOUT`，其餘全部當 `NETWORK_ERROR`。

`UNDECLARED_STATUS` 冇 `response` 就 call `createDefinitionError`，會 throw `TypeError('UNDECLARED_STATUS requires a response')`。

## Sentinels

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

Abort 同 timeout 共用嘅 `cause` / message values。

睇 [Errors guide](../core/errors.md)。
