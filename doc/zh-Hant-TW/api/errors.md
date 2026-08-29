---
title: 錯誤
description: RequestError 變體與工廠 helpers。
---

# 錯誤

HTTP execute 會在 tuple 第一格回傳用 kind 區分的 `RequestError` — 已宣告的失敗不是 throw。

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

用 `error.kind` 分支：`'http' | 'transport' | 'definition'`。

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

這是已宣告 error status 的回應。未宣告 status 不是 `HttpStatusError`，而是 `DefinitionError` / `UNDECLARED_STATUS`。

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

三種變體都是原生 `Error`，可以直接記錄 `String(error)`。`kind`、`code`、`status`、`response`、`data` 等 Defjs metadata 是可列舉的自有屬性；`name` 與原生 `cause` 不可列舉。支援 cause chain 的 logger 可以繼續沿著 `cause` 記錄。

Struct helpers 不會複製到外層 `DefinitionError`；必須先縮窄 cause：

```ts
import { StructError, type RequestError } from '@defjs/core'

function logStructCause(error: RequestError): void {
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

## 工廠函式

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

`createTransportError` 會把 abort／timeout 哨兵對到 `ABORTED`／`TIMEOUT`，其餘都是 `NETWORK_ERROR`。

`UNDECLARED_STATUS` 呼叫 `createDefinitionError` 時少了 `response`，會拋出 `TypeError('UNDECLARED_STATUS requires a response')`。

## 哨兵值

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

abort 與 timeout 共用的 `cause`／message。

見 [錯誤指南](../core/errors.md)。
