---
title: Errors
description: RequestError 几种和工厂 helpers。
---

# Errors

HTTP execute 把可判别的 `RequestError` 放在 tuple 第一项——声明过的失败不抛异常。

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

按 `error.kind` 分支：`'http' | 'transport' | 'definition'`。

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

这是声明过的错误 status 响应。未声明 status 不是 `HttpStatusError`，而是 `DefinitionError` / `UNDECLARED_STATUS`。

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

三种变体都是原生 `Error`，可以直接记录 `String(error)`。`kind`、`code`、`status`、`response`、`data` 等 Defjs metadata 是可枚举自有属性；`name` 与原生 `cause` 不可枚举。支持 cause chain 的日志器可以继续沿 `cause` 记录。

Struct helper 不会复制到外层 `DefinitionError`；必须先缩窄 cause：

```ts
import { StructError, type RequestError } from '@defjs/core'

function logStructCause(error: RequestError): void {
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

## 工厂

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

`createTransportError` 把 abort/timeout 哨兵映射成 `ABORTED` / `TIMEOUT`，其余都是 `NETWORK_ERROR`。

对 `UNDECLARED_STATUS` 调用 `createDefinitionError` 时缺少 `response` 会抛出 `TypeError('UNDECLARED_STATUS requires a response')`。

## 哨兵

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

abort 和 timeout 共用的 `cause` / message。

见 [Errors 指南](../core/errors.md)。
