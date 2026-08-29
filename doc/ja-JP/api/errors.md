---
title: Errors
description: RequestError のバリアントとファクトリヘルパーです。
---

# Errors

HTTP の execute は、タプルの先頭に判別可能な `RequestError` を返します。宣言済みの失敗を throw しません。各バリアントはネイティブ `Error` です。`String(error)` を直接ログでき、Defjs の metadata は enumerable のまま、`cause` は non-enumerable なネイティブ cause chain を使います。

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

`error.kind` で分岐します。`'http' | 'transport' | 'definition'` です。

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

宣言済みの non-2xx status です。未宣言 status はこのバリアントではなく、`kind: 'definition'` / `UNDECLARED_STATUS` です。

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

`UNDECLARED_STATUS` は `HttpStatusError` ではなく、このバリアントです。`INTERCEPTOR_FAILED` はインターセプターの throw であり、socket 切断ではありません。

`format()`、`flatten()`、`prettify()` helper は `cause` を narrow した後の `StructError` だけに属し、外側の `DefinitionError` へはコピーされません。

```ts
import { StructError, type DefinitionError } from '@defjs/core'

function describeDefinitionCause(error: DefinitionError): string | undefined {
  if (error.cause instanceof StructError) {
    return error.cause.prettify()
  }
  return undefined
}
```

## ファクトリ

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

`createTransportError` は abort/timeout のセンチネルを `ABORTED` / `TIMEOUT` に対応づけ、それ以外は `NETWORK_ERROR` です。

`UNDECLARED_STATUS` には `response` が必要です。これなしの factory 呼び出しは `TypeError` を throw します。

## センチネル

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

abort と timeout で共有する `cause` / メッセージです。

[Errors ガイド](../core/errors.md) を見てください。
