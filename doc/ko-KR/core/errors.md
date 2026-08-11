---
title: 오류
description: 트랜스포트별 결과 튜플을 처리하고 일반 판별 union인 RequestError를 기준으로 분기합니다.
---

# 오류

지원되는 모든 트랜스포트는 오류 우선 3요소 튜플을 반환하지만 세 번째 요소는 트랜스포트마다 다릅니다.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP는 디코딩된 데이터와 Defjs `HttpResponse` 래퍼를 반환합니다.
- SSE는 논리 스트림 핸들과 시작 시점 open 스냅샷을 반환합니다.
- WebSocket은 논리 세션과 시작 시점 connection 스냅샷을 반환합니다.

실패하면 두 번째 요소는 `undefined`입니다. 트랜스포트가 해당 스냅샷을 만들기 전에 시작에 실패했다면 세 번째 요소도 `undefined`일 수 있습니다.

## `RequestError`

`RequestError`는 튜플로 반환되는 일반 판별 객체입니다. native `Error` class를 상속하지 않습니다.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

이 union은 `RequestError<TErrorData>`라는 이름으로 export됩니다.

먼저 `kind`로 분기하고, 필요하면 이어서 `code`로 분기하세요.

### HTTP 상태 오류

선언된 비-2xx HTTP 응답은 다음 값을 만듭니다.

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

generic 순서는 data, status입니다. 넓은 `RequestError<TErrorData>` export는 애플리케이션 경계에서 계속 유용하지만, endpoint 실행은 status별 `HttpStatusError<Data, Status>` branch의 union을 반환합니다. 따라서 `error.status`를 검사하면 `error.data`가 해당 status에 선언된 body로 좁혀집니다.

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // 이 endpoint에서 나머지 409 | 422 status는 같은 conflict body를 사용합니다.
    console.error(error.data.conflict)
  }
}
```

`data`는 `HttpStatusError`에만 있습니다. endpoint 경계에서는 이 status 연관 union을 유지하고 서로 무관한 data union으로 넓히지 마세요.

### Transport 오류

네트워크 작업 실패, 취소, timeout은 다음 값을 만듭니다.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

transport 오류에는 `data`나 `response` 필드가 없습니다.

### 정의 오류

입력 디코딩, 요청 구성, 응답 디코딩, 선언되지 않은 HTTP status 처리는 다음 값을 만들 수 있습니다.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| 코드                         | 현재 발생 조건                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 입력 구조 디코딩 실패, 요청 구성 실패 또는 `build`가 유효하지 않은 binding을 생성한 경우입니다. |
| `RESPONSE_VALIDATION_FAILED` | 선언된 응답 또는 SSE 시작 응답이 구조/content 검증에 실패한 경우입니다.                         |
| `UNDECLARED_STATUS`          | `output`을 선언했는데 HTTP가 대응하는 output Struct가 없는 status를 반환한 경우입니다.          |

`UNDECLARED_STATUS`는 일치하지 않는 2xx와 비-2xx status 모두에 적용됩니다.

## 분기

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

명시적인 민감 정보 마스킹 및 보존 정책이 없다면 `cause`, `data`, 응답 header, body, URL을 로그에 남기지 마세요.

### Native `Error` 브리지

일부 통합은 native `Error` throw를 요구합니다. 그 경계에서 새로운 diagnostic error를 만들고 기본적으로 안정적인 `kind`, `code`와 사용 가능한 HTTP `status` 분류만 노출하세요.

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

새로 만든 오류는 경계에서 생성한 자체 stack을 유지합니다. 원본 `cause`, cause 메시지나 stack frame, `data`, 응답 header나 body, 요청 및 응답 URL을 절대 첨부하거나 복사하지 않습니다. stack frame 문자열 자체에 URL과 secret이 포함될 수 있으므로 선택한 cause frame을 복사하는 것도 안전한 기본값이 아닙니다. 실행 가능한 `examples/observability-redacted-logging` 프로젝트는 404 status가 유지되는지 검증하면서 응답 데이터와 secret을 의도적으로 넣은 cause stack이 유출되지 않는지도 확인합니다.

## 응답 가용성

`HttpResponse`는 native `Response`가 아니라 Defjs 래퍼입니다. status, status text, header, URL, body, `error`, `ok`를 노출합니다. `ok`는 status가 2xx 범위라는 뜻일 뿐입니다. `error`는 transport 또는 body 표현 실패에만 사용되며 일반적인 비-2xx 응답에서는 비어 있습니다.

유효하고 선언된 비-2xx body는 Struct로 디코딩되어 typed `HttpStatusError.data`에 보존됩니다. 잘못된 representation은 대신 `RESPONSE_VALIDATION_FAILED`를 만들고, 원래 codec 예외를 `cause`에, 수신한 response를 response 필드에 보존하며 `data`는 만들지 않습니다.

HTTP에서는 다음과 같이 동작합니다.

- 선언된 HTTP status 오류에는 `error.response`가 있습니다.
- 응답 output 검증 오류와 선언되지 않은 status에는 `error.response`가 있을 수 있습니다.
- 요청 검증 실패, 응답 전 취소, 인터셉터 throw, status 0 트랜스포트 실패에는 튜플 response가 없을 수 있습니다.

SSE 시작에 실패해도 응답을 받은 뒤 content 또는 status 검증에서 실패했다면 세 번째 요소인 open 스냅샷이 있을 수 있습니다. WebSocket 시작에 실패하면 connection 스냅샷이 실제로 캡처된 경우에만 반환될 수 있습니다.

## 오류 factory와 상수

root entry는 통합 코드에서 사용할 factory helper를 export합니다.

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)`는 abort, timeout, 기타 원인을 정규화합니다.
- `createDefinitionError(code, cause, response?)`는 정의 오류를 만듭니다.
- `createHttpStatusError(status, message, response, data?)`는 HTTP status 오류를 만듭니다.
- `ERR_ABORTED`와 `ERR_TIMEOUT`은 normalizer가 인식하는 공유 `Error` 값입니다.

이 helper들은 일반 `RequestError` 객체를 만들며 throw하지 않습니다.

내장 커맨드 경로는 예상 가능한 시작 실패를 튜플로 변환합니다. 하지만 튜플 처리가 임의의 확장 코드까지 포괄하지는 않습니다. 사용자 정의 인터셉터와 애플리케이션 callback은 throw할 수 있고, 런타임의 범용 `execute` 구현에 지원되지 않는 커맨드를 전달하면 promise가 reject됩니다.

## 다음 단계

- [HTTP](/ko-KR/core/http)에서는 status별 응답 선택과 디코딩을 설명합니다.
- [SSE](/ko-KR/core/sse)에서는 시작 실패와 open 이후 오류를 구분합니다.
- [WebSocket](/ko-KR/core/web-socket)에서는 런타임 오류와 최종 종료를 설명합니다.
