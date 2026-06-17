---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# 클라이언트

`@defjs/core`는 **명시적 클라이언트** 설계를 사용해요. 모든 요청은 직접 명시적으로 만든 `Client` 인스턴스를 통해 실행돼요. 덕분에 테스트, 멀티 환경 설정, 의존성 추적이 간단해요。

## 클라이언트 생성

`createClient`에 하나 이상의 설정 함수를 전달하세요.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

설정 함수는 합성되어요. 같은 키에 대해서는 나중에 적용된 함수가 앞선 함수를 덮어써요.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### 설정 옵션

| 함수                                | 설명                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `withEndpoint(url)`                 | 기본 API 주소.                                                              |
| `withHTTPHandle(fetch)`             | HTTP용 커스텀 `fetch` 구현.                                                 |
| `withSSEHandle(fetch)`              | SSE용 커스텀 `fetch` 구현.                                                  |
| `withWebSocketHandle(WebSocket)`    | 커스텀 `WebSocket` 생성자(예: Node용).                                      |
| `withInterceptors(...interceptors)` | 트랜스포트 레이어 인터셉터를 등록해요. `kind`에 따라 자동으로 디스패치돼요. |
| `withQueryParamsSerializer(fn)`     | 커스텀 쿼리 파라미터 직렬화.                                                |
| `withCredentials(boolean)`          | 교차 출처 인증 정보 포함 여부.                                              |
| `withXSRF(options)`                 | XSRF 토큰 읽기 및 주입 동작.                                                |
| `withSSEOptions(options)`           | SSE 재연결, 큐, 잘못된 이벤트 처리 등.                                      |
| `withWebSocketOptions(options)`     | WebSocket 하트비트, 재연결, 큐, 서브프로토콜 등.                            |

SSE와 WebSocket별 설정은 [SSE](/core/sse)와 [WebSocket](/core/web-socket) 문서를 참조하세요.

## 커맨드 실행

`Client.execute`는 오버로드된 메서드로, `Command` 타입에 따라 올바른 트랜스포트 레이어로 디스패치해요.

### HTTP 요청

`defineRequest`로 만든 커맨드를 전달하세요. 세 값을 반환해요:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

반환 타입:

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE 이벤트 스트림

`defineEventStream`으로 만든 커맨드를 전달하세요. 스트림 핸들과 연결 정보를 반환해요.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

반환 타입:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket 연결

`defineWebSocket`으로 만든 커맨드를 전달하세요. 세션 객체를 반환해요.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

반환 타입:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## 헬퍼 함수

### `isClient`

값이 유효한 `Client` 인스턴스인지 확인해요.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

내부 설정 객체를 추출하여 디버깅하거나 상위 추상화를 빌드할 때 사용해요.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

값이 `Client` 인스턴스가 아니면 `getClientConfig`가 `TypeError`를 던져요.

## 명시적 클라이언트 설계

Defjs의 모든 클라이언트는 명시적으로 생성돼요. `createClient`로 `Client`를 만들고 필요한 곳에 전달하면 돼요.

명시적 생성의 장점:

- **테스트 친화적**: 테스트에 다른 `Client` 인스턴스를 직접 전달하여 어떤 상태도 리셋하거나 모킹할 필요 없이 사용할 수 있어요.
- **멀티 환경 공존**: 여러 클라이언트가 동일 프로세스에서 병렬로 실행할 수 있어요(예: 내부 API + 공개 API).
- **의존성 투명성**: 호출자가 명시적으로 `Client`를 보유해야 해서, 정적 분석과 코드 리뷰에서 의존성이 보여요.

애플리케이션에서 공유 클라이언트가 필요하다면 모듈에서보내세요:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

그리고 비즈니스 코드에서 가져와 사용하세요:

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## 다음 단계

- [HTTP 요청 →](/core/http) — `defineRequest`와 출력 패턴
- [SSE →](/core/sse) — SSE 정의, 재연결, 이벤트 큐
- [WebSocket →](/core/web-socket) — WebSocket 정의, 하트비트, 재연결 전략
- [인터셉터 →](/core/interceptors) — 인터셉터 타입과 어니언 체인 메커니즘
