---
title: Fehler
description: RequestError-Varianten und Factory-Helper.
---

# Fehler

HTTP-Execute legt ein discriminated `RequestError` in den ersten Slot des Tuples — kein Throw für deklarierte Failures. Jede Variante ist ein natives `Error`: `String(error)` kann direkt geloggt werden, Defjs-Metadaten bleiben enumerable und `cause` verwendet die native, nicht enumerable Cause-Chain.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Branche auf `error.kind`: `'http' | 'transport' | 'definition'`.

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

Deklarierter Non-2xx-Status. Ein nicht deklarierter Status ist nicht diese Variante, sondern `kind: 'definition'` / `UNDECLARED_STATUS`.

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

`UNDECLARED_STATUS` ist diese Variante, nicht `HttpStatusError`. `INTERCEPTOR_FAILED` bezeichnet einen Throw des Interceptors, nicht einen getrennten Socket.

Die Helper `format()`, `flatten()` und `prettify()` gehören nur zum nach `cause`-Narrowing erkannten `StructError`; sie werden nicht auf den äußeren `DefinitionError` kopiert:

```ts
import { StructError, type DefinitionError } from '@defjs/core'

function describeDefinitionCause(error: DefinitionError): string | undefined {
  if (error.cause instanceof StructError) {
    return error.cause.prettify()
  }
  return undefined
}
```

## Factory-Funktionen

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

`createTransportError` mappt Abort-/Timeout-Sentinels auf `ABORTED` / `TIMEOUT`, alles andere auf `NETWORK_ERROR`.

`UNDECLARED_STATUS` braucht eine `response`; ein Factory-Aufruf ohne sie wirft `TypeError`.

## Sentinels

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

Geteilte `cause`- / Message-Werte für Abort und Timeout.

Siehe [Fehler-Guide](../core/errors.md).
