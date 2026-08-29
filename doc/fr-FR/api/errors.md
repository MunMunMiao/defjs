---
title: Erreurs
description: Variantes RequestError et helpers factory.
---

# Erreurs

L’execute HTTP renvoie un `RequestError` discriminé dans le premier slot du tuple — pas un throw pour les échecs déclarés. Chaque variante est un `Error` natif : `String(error)` peut être journalisé directement, les métadonnées Defjs restent énumérables et `cause` utilise la chaîne causale native non énumérable.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Branche sur `error.kind` : `'http' | 'transport' | 'definition'`.

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

Statut non-2xx déclaré. Un statut non déclaré n’est pas cette variante, mais `kind: 'definition'` / `UNDECLARED_STATUS`.

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

`UNDECLARED_STATUS` est cette variante, pas `HttpStatusError`. `INTERCEPTOR_FAILED` désigne un throw de l’intercepteur, pas un socket déconnecté.

Les helpers `format()`, `flatten()` et `prettify()` appartiennent seulement au `StructError` après narrowing de `cause` ; ils ne sont pas copiés sur le `DefinitionError` externe :

```ts
import { StructError, type DefinitionError } from '@defjs/core'

function describeDefinitionCause(error: DefinitionError): string | undefined {
  if (error.cause instanceof StructError) {
    return error.cause.prettify()
  }
  return undefined
}
```

## Fabriques

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

`createTransportError` mappe les sentinels abort/timeout vers `ABORTED` / `TIMEOUT`, tout le reste vers `NETWORK_ERROR`.

`UNDECLARED_STATUS` requiert `response` ; un appel de factory sans celle-ci lance `TypeError`.

## Sentinelles

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

Valeurs `cause` / message partagées pour abort et timeout.

Voir [le guide Erreurs](../core/errors.md).
