---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# 커맨드

Defjs는 "커맨드"를 중심으로 빌드되어 있어요: `defineRequest`, `defineEventStream`, `defineWebSocket`으로 만든 타입 안전한 실행 가능한 객체예요. 각 커맨드는 `kind`(트랜스포트 타입), `definition`(엔드포인트 스키마), `input`(호출 데이터)을 담고 있어요. Client는 `kind`에 따라 올바른 트랜스포트 로직으로 디스패치해요.

## defineRequest: HTTP 엔드포인트 정의

`defineRequest`는 RESTful HTTP 엔드포인트를 정의해요. 정의 객체를 받고 커맨드 빌더를 반환해요.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### 정의 객체 필드

| 필드           | 타입                              | 설명                                                  |
| -------------- | --------------------------------- | ----------------------------------------------------- |
| `method`       | `string`                          | HTTP 메서드, 예: `GET`, `POST`                        |
| `path`         | `string`                          | URL 경로, `:param` 자리 표시자 지원                   |
| `input`        | `AnyStruct \| undefined`          | 입력 데이터 Struct 검증기                             |
| `build`        | `RequestBuildHandler`             | 파싱된 입력을 HTTP 요청 파트로 매핑                   |
| `output`       | `RequestOutputShape \| undefined` | 상태 코드를 응답 Struct에 매핑                        |
| `responseType` | `HttpResponseType`                | 선택적, 응답 파싱 모드를 강제(`json`, `text`, `blob`) |

### input / output / build 관계

1. **input**: 호출자가 반드시 제공해야 하는 데이터를 설명해요. 실행 시점에 Client는 `input` Struct를 사용해 원시 입력을 검증하고 파싱해요.
2. **build**: `RequestBuilder`와 파싱된 입력(`RequestBuildInput`)을 받아, 데이터를 경로 파라미터, 쿼리 파라미터, 헤더, 바디로 매핑해요.
3. **output**: 가능한 서버 응답을 설명해요. Client는 HTTP 상태 코드로 일치하는 Struct를 선택하고, 성공(2xx)과 오류(non-2xx) 타입을 추론해요.

`build`를 생략하면 `input`도 반드시 생략해야 해요. 그러면 커맨드는 입력을 받지 않고 `path`로 직접 전송돼요.

`build`가 제공되면 `input`도 반드시 제공되어야 해요. 이것은 엄격한 설계 규칙이에요.

### 입력 없이 빠르게 사용

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // 인자가 필요 없어요
```

### 출력 타입 추론

`output`은 배열과 객체 형태를 모두 지원하며 동작은 동일해요:

```typescript
// 배열 형태 (권장)
output: [
  { status: 200, body: UserSchema },
  { status: [401, 403], body: AuthErrorSchema },
]

// 객체 형태
output: {
  200: UserSchema,
  '401': AuthErrorSchema,
  '403': AuthErrorSchema,
}
```

실행 결과는 자동으로 타입화돼요: 2xx 데이터는 성공 분기로, 나머지는 오류 분기로 들어가요.

---

## defineEventStream: SSE 스트림 정의

`defineEventStream`은 Server-Sent Events(SSE) 엔드포인트를 정의해요. 이벤트 이름을 Struct에 매핑하여 이벤트 레벨 타입 안전성을 제공해요.

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### events 매핑

`events`의 각 키는 SSE `event` 필드에 대응해요. 메시지가 도착하면 Client는 `event` 이름으로 일치하는 Struct를 찾아요.

### default 폴백

서버가 선언되지 않은 이벤트 이름을 보낼 수 있다면 `default` 스키마를 폴백으로 제공하세요:

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // 일치하지 않는 이벤트는 문자열로 파싱
  },
})
```

`default` 없이 일치하지 않는 이벤트는 무시돼요. `onInvalidEvent` 인터셉터가 설정되어 있으면 알림을 받아요.

### 입력이 있는 SSE

SSE는 기본적으로 `GET`을 사용해요. 쿼리 파라미터가 필요하면 `defineRequest`와 마찬가지로 `input`과 `build`를 제공하세요:

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

SSE `build`는 요청 바디와 `withCredentials`를 지원하지 않아요.

---

## defineWebSocket: WebSocket 정의

`defineWebSocket`은 WebSocket 엔드포인트를 정의해요. **incoming**(서버 → 클라이언트)과 **outgoing**(클라이언트 → 서버) 메시지 스키마를 구분해요.

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### incoming 메시지 스키마

`incoming`은 서버가 푸시하는 메시지 타입을 정의해요. 각 메시지는 `incoming` 키와 일치하는 `type` 필드를 포함해야 해요. 페이로드가 객체이면 필드가 `type`과 병합돼요:

```typescript
// 서버가 보냄: { type: 'message', user: 'Alice', text: 'Hi' }
// 클라이언트가 받음: { type: 'message', user: 'Alice', text: 'Hi' }
```

페이로드가 스칼라(문자열, 숫자 등)이면 `{ type: 'xxx', data: <value> }`로 감싸져요.

### outgoing 메시지 스키마

`outgoing`은 클라이언트가 보내는 메시지 타입을 정의해요. `type`은 키 이름으로 자동 채워져요. 페이로드만 제공하면 돼요:

```typescript
// 전송: { type: 'sendMessage', text: 'Hello' }
// 또는: { type: 'sendMessage', data: { text: 'Hello' } }
```

outgoing 메시지 페이로드가 객체이면 두 형태 모두 지원돼요. 스칼라이면 `{ type: 'xxx', data: <value> }`를 사용해야 해요.

### incoming 전용 WebSocket

서버에 메시지를 보낼 필요가 없다면 `outgoing`을 생략하세요:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### WebSocket build 제한

WebSocket `build`는 `setPathParams`와 `setQueryParams`만 지원해요. HTTP 전용 동작(헤더, 바디)은 지원하지 않아요.

---

## 커맨드 객체 구조

정의 타입에 관계없이 만들어진 커맨드는 통일된 구조를 따르세요:

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP 커맨드
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE 커맨드
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket 커맨드
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind`는 트랜스포트 타입 태그예요. `Client.execute`는 이를 기반으로 적절한 실행기(HTTP fetch, SSE 스트림, WebSocket 연결)로 디스패치해요.

---

## 입력 선택 규칙 (IsInputOptional)

커맨드 빌더의 인자가 선택적일지 여부는 `IsInputOptional`에 의해 자동으로 추론돼요:

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

규칙:

1. **`input`이 정의되지 않음**: `TInput`이 `undefined`, 인자는 완전히 선택적이에요.
2. **`input`이 있지만 모든 필드가 선택적**: `{} extends EndpointInput<...>`이 true, 인자는 여전히 선택적이에요.
3. **`input`에 필수 필드가 있음**: 인자는 필수예요.

```typescript
// 입력 없음 — 선택적
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// 모든 필드가 선택적인 입력 — 선택적
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// 필수 필드 — 필수
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript 오류: 인자 누락
C({ body: { name: 'defjs' } }) // OK
```

## 다음 단계

- [SSE →](/core/sse) — SSE 실행, 재연결, 이벤트 처리
- [WebSocket →](/core/web-socket) — WebSocket 연결, 하트비트, 상태 관리
- [클라이언트 →](/core/client) — 클라이언트 생성과 `execute` 사용법
