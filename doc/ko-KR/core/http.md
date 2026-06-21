---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

`defineRequest`로 HTTP 엔드포인트를 정의하고 `Client.execute()`로 실행하세요. 코어 패키지는 스키마 검증, 상태 코드 디스패치, 시그널 병합, 응답 바디 파싱을 자동으로 처리해요.

## 엔드포인트 정의

`defineRequest`는 `method`, `path`, `input`(선택적), `output`(선택적), `build`(선택적)을 포함한 정의 객체를 받아요.

`input`이 제공되면 `build`도 반드시 제공되어야 입력 필드를 경로 파라미터, 쿼리 파라미터, 헤더, 바디에 매핑하는 방법을 설명해야 해요.

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

입력이 필요 없으면 `input`과 `build` 모두 생략하세요:

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## 상태 코드-스키마 출력 매핑

`output`은 HTTP 상태 코드를 스키마에 매핑해요. 런타임은 응답 상태 코드로 일치하는 스키마를 선택해요.

객체와 배열 형태 모두 지원해요:

```typescript
import { defineRequest, object, string } from '@defjs/core'

// 객체 형태: 키는 상태 코드, 값은 스키마
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// 배열 형태: 여러 상태 코드를 같은 스키마에 매핑 가능
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

서버가 `output`에 선언되지 않은 상태 코드를 반환하면 `code`가 `UNDECLARED_STATUS`인 `DefinitionError`로 요청이 실패해요.

## 성공 / 오류 데이터 타입 추론

`output`은 TypeScript 타입 추론을 주도해요. `Client.execute()`는 `HttpAwaitResult`를 반환하여 2xx 성공 데이터와 non-2xx 오류 데이터를 자동으로 구분해요.

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result는 { id: number; name: string }으로 타입화됨
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data는 { field: string; reason: string } | { traceId: string }으로 타입화됨
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### 타입 헬퍼

- `RequestSuccessData<TOutput>`: `output`에서 모든 2xx 스키마 출력 타입을 추출해요. 2xx 매핑이 없으면 `unknown`으로 추론돼요.
- `RequestErrorData<TOutput>`: `output`에서 모든 non-2xx 스키마 출력 타입을 추출해요. non-2xx 매핑이 없으면 `unknown`으로 추론돼요.

## 요청 실행

`Client.execute()`에 커맨드를 전달하세요. 두 번째 인자는 선택적인 `HttpExecuteOptions`예요:

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* 인터셉터에서 읽을 수 있는 커스텀 컨텍스트 */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // 별칭, abort와 동일
})
```

반환되는 `HttpAwaitResult`는 트리플릿이에요:

| 위치 | 타입                                     | 의미                                           |
| ---- | ---------------------------------------- | ---------------------------------------------- |
| 0    | `RequestError<TErrorData> \| null`       | 오류 객체; 성공 시 `null`                      |
| 1    | `TSuccess \| undefined`                  | 성공 데이터; 실패 시 `undefined`               |
| 2    | `SettledResponse<TSuccess> \| undefined` | 원시 응답 래퍼(`status`, `headers`, `body` 등) |

## 취소와 타임아웃

`abort`, `timeout`, `signal`은 요청 생명주기를 제어해요. **`abort`와 `timeout`은 함께 사용할 수 없어요** — 함께 사용하면 요청 전송 전에 검증 오류가 발생해요.

### AbortSignal 사용

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// 나중에 취소
controller.abort()

// 취소 후 error.kind는 'transport', code는 'ABORTED'
```

### 타임아웃 사용

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5초 타임아웃
})

// 타임아웃 후 error.kind는 'transport', code는 'TIMEOUT'
```

### 외부 시그널 병합

`abort`와 `signal`이 모두 전달되면 프레임워크는 하나의 `AbortSignal`로 병합해요. `timeout`도 `AbortSignal.timeout()`으로 참여해요. 어떤 시그널이든 트리거되면 요청이 중단돼요.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // abort와 병합
})
```

### 오류 구분

취소와 타임아웃은 모두 `TransportError`이며 `error.code`로 구분해요:

| 시나리오      | `error.code`    | 설명                                               |
| ------------- | --------------- | -------------------------------------------------- |
| 수동 취소     | `ABORTED`       | `controller.abort()`나 외부 시그널 트리거          |
| 타임아웃      | `TIMEOUT`       | `timeout` 만료 또는 `AbortSignal.timeout()` 트리거 |
| 네트워크 실패 | `NETWORK_ERROR` | fetch에서 발생한 다른 예외                         |

## 다운로드 / 업로드 진행 상황

`onDownloadProgress`와 `onUploadProgress`로 진행 상황을 추적하세요.

### 다운로드 진행

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent`는 세 필드를 포함해요:

- `lengthComputable`: 서버가 `Content-Length`를 반환했는지 여부
- `loaded`: 지금까지 수신된 바이트
- `total`: 전체 바이트(`lengthComputable`이 `true`일 때만 유효)

### 업로드 진행

업로드 진행은 요청 바디가 `ReadableStream<Uint8Array>`일 때만 동작해요. 프레임워크는 스트림을 감싸고 각 청크 후에 콜백을 호출해요.

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## 응답 타입

기본적으로 `output`이 선언되면 프레임워크는 응답을 `json`으로 자동 파싱해요. `responseType`으로 덮어쓸 수 있으며, `output`이 `undefined`일 때 지정할 수도 있어요.

```typescript
import { defineRequest } from '@defjs/core'

// 명시적 응답 타입
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// 출력 없음, 원시 응답만 관심
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

지원되는 `responseType` 값:

| 값            | 설명                                                |
| ------------- | --------------------------------------------------- |
| `json`        | 텍스트를 읽고 `JSON.parse()`; 빈 바디는 `null` 반환 |
| `text`        | 텍스트 문자열을 직접 반환                           |
| `blob`        | `Blob` 반환                                         |
| `arraybuffer` | `ArrayBuffer` 반환                                  |

`responseType`이 `json`이고 `output`이 반환된 상태 코드에 대한 스키마를 정의하면, 프레임워크는 파싱된 JSON을 스키마에 대해 검증해요. 검증이 실패하면 `code: 'RESPONSE_VALIDATION_FAILED'`인 `DefinitionError`를 반환해요.

## 다음 단계

- [클라이언트 →](/core/client) — `Client` 생성, 인터셉터, XSRF, 전역 옵션
- [SSE →](/core/sse) — 서버 전송 이벤트와 스트리밍 응답
- [WebSocket →](/core/web-socket) — 양방향 실시간 통신
