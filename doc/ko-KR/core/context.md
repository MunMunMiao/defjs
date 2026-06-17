---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# 컨텍스트

Defjs 실행 흐름: 클라이언트 설정이 전역 기본값을 제공하고, 커맨드 정의가 엔드포인트 구조를 설명하며, `build`는 파싱된 입력을 HTTP 요청 파트로 매핑하고, `HttpContext`는 단일 실행 생명주기 동안 인터셉터 사이에 보이지 않는 짐처럼 전달돼요.

## HttpContext 전달

`HttpContext`는 단일 요청/연결 생명주기 내에서 메타데이터를 담는 토큰 기반 키-값 컨테이너예요. URL, 헤더, 바디 직렬화에는 참여하지 않아요. 인터셉터에서 읽고 써요.

### 생성과 사용

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. 토큰 정의(기본값 포함)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. 컨텍스트 생성 및 값 설정
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. 실행 시점에 전달
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### 인터셉터에서 읽기

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### 컨텍스트 병합

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged에 requestId와 auth 모두 포함됨
```

### 주요 API

| Export                                           | 설명                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `makeHttpContextToken<T>(defaultValue: () => T)` | 기본값을 가진 토큰 생성                                      |
| `makeHttpContext()`                              | 빈 컨텍스트 생성                                             |
| `makeHttpContext(entries)`                       | `[token, value]` 배열에서 생성                               |
| `makeHttpContext(otherContext)`                  | 다른 컨텍스트 복사                                           |
| `mergeHttpContexts(primary, secondary)`          | 두 컨텍스트 병합; 같은 토큰은 secondary가 primary를 덮어써요 |
| `ctx.set(token, value)`                          | 값 쓰기; 자기 자신 반환(체인 가능)                           |
| `ctx.get(token)`                                 | 값 읽기; 설정되지 않았으면 토큰 기본값 반환                  |
| `ctx.has(token) / ctx.del(token)`                | 확인 / 삭제                                                  |
| `ctx.keys() / ctx.length`                        | 순회 / 개수                                                  |

---

## 요청 빌더와 입력 파싱

### 입력 파싱 흐름

커맨드를 실행할 때 Client는 다음 순서로 입력을 처리해요:

1. **검증**: `input` Struct를 사용해 호출자의 원시 데이터를 검증하고 파싱해요.
2. **빌드**: `build(request, parsedInput)`를 호출하여 파싱된 데이터를 요청 파트로 매핑해요.
3. **트랜스포트**: `kind`에 따라 HTTP fetch, SSE 스트림, WebSocket 연결로 디스패치해요.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Build 핸들러 기능 매트릭스

트랜스포트마다 지원하는 `build` 동작이 달라요:

| Build 메서드                              | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

트랜스포트에서 지원하지 않는 메서드를 `build`에서 사용하면 실행 시점에 `REQUEST_VALIDATION_FAILED`를 던져요.

### 자동 빌드

`build`를 생략하면 `input`도 생략해야 해요. 하지만 Struct의 `request` 형태를 사용하여 프레임워크가 빌드 로직을 자동으로 추론하도록 할 수 있어요:

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // build가 필요 없음; 프레임워크가 경로/쿼리를 자동 매핑
})
```

`build`가 제공되면 `input`도 반드시 제공되어야 해요. 이것은 엄격한 설계 규칙이에요.

---

## 클라이언트 설정

`createClient`와 하나 이상의 설정 함수로 클라이언트를 생성하세요. 같은 키에 대해서는 나중 함수가 앞선 함수를 덮어써요.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### 코어 옵션

#### `withEndpoint(url)`

기본 API 주소를 설정해요. 모든 요청 `path` 값은 이 URL 뒤에 붙어요.

```typescript
withEndpoint('https://api.example.com/v1')
// /users를 요청하면 https://api.example.com/v1/users가 생성돼요
```

#### `withCredentials(boolean)`

교차 출처 인증 정보(쿠키, HTTP 인증 헤더, TLS 클라이언트 인증서)를 포함할지 여부예요. `fetch`의 `credentials` 옵션에 대응해요.

```typescript
withCredentials(true) // 교차 출처 요청에 쿠키 포함
withCredentials(false) // 기본값
```

#### `withXSRF(options)`

XSRF 토큰 읽기 및 주입 동작을 설정해요. 기본적으로 `document.cookie`에서 `XSRF-TOKEN`을 읽고 `X-XSRF-TOKEN` 헤더에 주입해요.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // 커스텀 읽기 로직, 예: localStorage에서
    return localStorage.getItem('xsrf-token')
  },
})
```

| 필드            | 타입                                   | 기본값                     |
| --------------- | -------------------------------------- | -------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`             |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`           |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | `document.cookie`에서 읽음 |

#### `withQueryParamsSerializer(fn)`

커스텀 쿼리 파라미터 직렬화. 기본값은 `URLSearchParams.toString()`이에요.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

커스텀 직렬화기가 제공되면 HTTP와 SSE 요청에서 복잡한 쿼리 파라미터를 사용할 수 있어요.

---

## 트랜스포트별 설정

### SSE 옵션

`withSSEOptions`나 개별 설정 함수로 설정하세요.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| 옵션                 | 설명                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `sse.fetch`          | SSE 전용 `fetch` 구현                                                        |
| `sse.reconnect`      | 재연결 전략: 시도 횟수, 지연, 백오프 계수, 지터, 최대 지연, 커스텀 결정 함수 |
| `sse.queue`          | 이벤트 큐: 최대 용량, 오버플로우 전략                                        |
| `sse.onInvalidEvent` | 잘못된 이벤트 옵저버(스키마 누락 또는 검증 실패)                             |
| `sse.maxBufferSize`  | 기본 버퍼 크기 제한(바이트)                                                  |

### WebSocket 옵션

`withWebSocketOptions`나 개별 설정 함수로 설정하세요.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| 옵션                      | 설명                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `webSocket.WebSocket`     | 커스텀 `WebSocket` 생성자                                                    |
| `webSocket.protocols`     | RFC 6455 서브프로토콜 배열                                                   |
| `webSocket.beforeConnect` | 연결 전 훅(예: 동적 토큰 가져오기)                                           |
| `webSocket.heartbeat`     | 하트비트: 간격, 타임아웃, 메시지 팩토리, ACK 판정 함수                       |
| `webSocket.reconnect`     | 재연결 전략: 시도 횟수, 지연, 백오프 계수, 지터, 최대 지연, 커스텀 결정 함수 |
| `webSocket.queue`         | 전송 큐: 최대 용량, 오버플로우 전략                                          |

### 하트비트 상세

WebSocket 하트비트는 연결 생존 여부를 감지해요. 설정하면 프레임워크가 `intervalMs` 간격으로 하트비트 메시지를 보내고 `timeoutMs` 내에 ACK를 기다려요. ACK가 타임아웃되면 재연결이 트리거돼요.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // 30초마다 하트비트 전송
  timeoutMs: 10000, // 10초 내에 ACK 수신 필요
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- 하트비트 메시지 타입은 `outgoing` 정의와 호환되어야 해요.
- `isAck`는 수신 메시지가 하트비트 응답인지 판정해요. `true`를 반환하면 해당 메시지는 `receive` 이터레이터에 들어가지 않아요.

---

## 설정 합성과 우선순위

설정 함수는 순서대로 적용되며, 나중 함수가 앞선 함수를 덮어써요. 실행 시점 옵션(`client.execute(cmd, { timeout: 5000 })`)이 최고 우선순위를 가지며, 그 다음이 클라이언트 레벨 설정이에요.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// 실행 시점에서 SSE 재연결을 덮어쓰기
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## 다음 단계

- [클라이언트 →](/core/client) — 클라이언트 생성과 `execute` 사용법
- [커맨드 →](/core/commands) — 커맨드 정의와 입력 선택 규칙
- [SSE →](/core/sse) — SSE 실행, 재연결, 이벤트 처리
- [WebSocket →](/core/web-socket) — WebSocket 연결, 하트비트, 상태 관리
- [인터셉터 →](/core/interceptors) — 인터셉터 타입과 어니언 체인 메커니즘
