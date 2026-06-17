---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# 오류

`@defjs/core`의 모든 실행 결과는 `[error, result, response]` 트리플릿으로 반환돼요. `error`는 `RequestError`로, `kind`와 `code`를 가진 판별 유니온이에요. `kind`와 `code`로 분기하는 것이 권장 패턴이며 문자열 비교는 피하세요.

## RequestError 구조

`RequestError`는 세 가지 오류 타입의 유니온이에요:

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

모든 오류는 공통 필드를 공유해요:

| 필드       | 타입                                    | 설명                                                |
| ---------- | --------------------------------------- | --------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | 최상위 분기를 위한 오류 카테고리                    |
| `code`     | `string`                                | 2단계 분기를 위한 정확한 오류 코드                  |
| `message`  | `string`                                | 사람이 읽을 수 있는 오류 설명                       |
| `data`     | `unknown`                               | 추가 데이터(`http`와 `definition` 오류에만 있음)    |
| `response` | `SettledResponseLike`                   | 원시 응답 객체(`http`와 `definition` 오류에만 있음) |

### HttpStatusError

서버가 `output`에 정의된 non-2xx 상태 코드를 반환할 때 발생해요.

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

`data` 타입은 일치하는 상태 코드의 `output` 스키마에서 추론돼요. 예를 들어 `output: { 404: notFoundStruct }`가 있으면 `error.data`는 `notFoundStruct`의 추론 타입으로 좁혀져요.

### TransportError

네트워크나 트랜스포트 레이어 실패 시 발생해요. 중단, 타임아웃, 일반적인 네트워크 오류를 포함해요.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

요청 정의나 검증 실패 시 발생해요.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| 코드                         | 발생 시나리오                                                             |
| ---------------------------- | ------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 입력 파라미터가 `input` struct 검증을 실패했거나, `build`에서 예외가 발생 |
| `RESPONSE_VALIDATION_FAILED` | 응답 바디가 반환된 상태 코드에 대한 `output` struct 검증을 실패           |
| `UNDECLARED_STATUS`          | 서버가 `output`에 선언되지 않은 2xx 상태 코드를 반환                      |

## 오류 분류와 분기

오류 타입을 문자열 비교로 판단하지 **마세요**:

```typescript
// 권장하지 않음: 취약하고 타입 좁히기가 안 됨
if (error.message.includes('timeout')) { ... }
```

**권장**: `kind`와 `code`로 분기하여 정확한 타입 좁히기를 하세요:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error가 HttpStatusError로 좁혀져요
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data가 { code: string; message: string }으로 좁혀져요
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error가 TransportError로 좁혀져요
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      // error가 DefinitionError로 좁혀져요
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## 내장 상수

`@defjs/core`는 특정 트랜스포트 오류를 식별하기 위한 두 가지 상수를보내요:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: 요청이主动 취소됨
// ERR_TIMEOUT: 요청 타임아웃
```

### 인터셉터에서 취소 트리거

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### AbortController와 함께 사용

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### 트랜스포트 오류를 수동으로 생성

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## 헬퍼 함수

### `createTransportError`

원시 예외를 `TransportError`로 정규화해요.

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

원시 예외를 `DefinitionError`로 정규화해요.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

non-2xx 응답을 `HttpStatusError`로 정규화해요.

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## 다음 단계

- [클라이언트 →](/core/client) — 클라이언트 생성과 커맨드 실행
- [HTTP 요청 →](/core/http) — `defineRequest`와 출력 패턴
- [SSE →](/core/sse) — SSE 오류와 재연결 전략
- [WebSocket →](/core/web-socket) — WebSocket 연결 오류 처리
