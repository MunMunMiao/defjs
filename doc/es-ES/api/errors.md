---
title: Errores
description: Variantes de RequestError y helpers factory.
---

# Errores

El execute HTTP devuelve un `RequestError` discriminado en el primer hueco de la tupla — no una excepción lanzada para fallos declarados. Cada variante es un `Error` nativo: puedes registrar `String(error)` directamente, los metadatos de Defjs siguen siendo enumerables y `cause` usa la cadena causal nativa no enumerable.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Ramifica con `error.kind`: `'http' | 'transport' | 'definition'`.

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

Estado no 2xx declarado. Un estado no declarado no es esta variante, sino `kind: 'definition'` / `UNDECLARED_STATUS`.

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

`UNDECLARED_STATUS` es esta variante, no `HttpStatusError`. `INTERCEPTOR_FAILED` indica que un interceptor lanzó un error, no que se desconectó el socket.

Los helpers `format()`, `flatten()` y `prettify()` solo pertenecen al `StructError` después de estrechar `cause`; no se copian al `DefinitionError` exterior:

```ts
import { StructError, type DefinitionError } from '@defjs/core'

function describeDefinitionCause(error: DefinitionError): string | undefined {
  if (error.cause instanceof StructError) {
    return error.cause.prettify()
  }
  return undefined
}
```

## Factorías

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

`createTransportError` mapea los sentinels de abort/timeout a `ABORTED` / `TIMEOUT`; todo lo demás a `NETWORK_ERROR`.

`UNDECLARED_STATUS` necesita `response`; una llamada a la factory sin ella lanza `TypeError`.

## Centinelas

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

Valores compartidos de `cause` / message para abort y timeout.

Ver [guía de Errores](../core/errors.md).
