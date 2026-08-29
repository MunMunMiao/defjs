---
title: 오류
description: RequestError 변형과 팩토리 헬퍼예요.
---

# 오류

HTTP 실행은 튜플 첫 칸에 판별 `RequestError`를 넣어요. 선언된 실패는 throw가 아니에요.

## RequestError {#RequestError}

```ts
type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

`error.kind`로 분기해요. `'http' | 'transport' | 'definition'`예요.

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

선언된 오류 status의 응답이에요. 미선언 status는 `HttpStatusError`가 아니라 `DefinitionError`의 `UNDECLARED_STATUS`예요.

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

세 변형은 모두 네이티브 `Error`이므로 `String(error)`를 바로 기록할 수 있어요. `kind`, `code`, `status`, `response`, `data` 같은 Defjs 메타데이터는 열거 가능한 자체 속성이고, `name`과 네이티브 `cause`는 열거되지 않아요. cause chain을 지원하는 로거는 `cause`를 따라갈 수 있어요.

Struct helper는 바깥 `DefinitionError`로 복사되지 않아요. 먼저 cause를 좁혀야 해요.

```ts
import { StructError, type RequestError } from '@defjs/core'

function logStructCause(error: RequestError): void {
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

## 팩토리

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

`createTransportError`는 abort/timeout 센티널을 `ABORTED` / `TIMEOUT`으로 매핑하고, 나머지는 `NETWORK_ERROR`예요.

`UNDECLARED_STATUS`에 `response` 없이 `createDefinitionError`를 호출하면 `TypeError('UNDECLARED_STATUS requires a response')`를 throw해요.

## 센티널

## ERR_ABORTED {#ERR_ABORTED}

## ERR_TIMEOUT {#ERR_TIMEOUT}

```ts
const ERR_ABORTED: Error // message: 'Request was aborted'
const ERR_TIMEOUT: Error // message: 'Request timed out'
```

abort와 timeout이 공유하는 `cause` / message 값이에요.

자세한 내용은 [오류 가이드](../core/errors.md)를 보세요.
