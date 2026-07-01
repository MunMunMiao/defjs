---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs는 `defineEventStream`으로 타입이 부여된 SSE(Server-Sent Events) 엔드포인트를 정의해요. 실행 후에는 `[error, stream, openInfo]` 트리플릿이 반환되며, `stream`은 서버 푸시 이벤트를 하나씩 소비하는 비동기 이터러블이에요.

## 이벤트 스트림 정의

SSE 엔드포인트를 정의할 때 `events` 필드를 선언하여 이벤트 이름을 struct에 매핑하세요. SSE 트랜스포트는 각 `data:` 페이로드를 원시 텍스트로 전달하며, Defjs는 일치하는 struct를 선택하고 해당 struct의 콘텐츠 종류에 따라 텍스트를 디코딩해요.

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

### 기본 이벤트 스키마 (폴백)

서버가 `events`에 명시적으로 선언되지 않은 이벤트 타입을 보낼 수 있다면 `default` struct를 폴백으로 제공하세요. `default` 없이는 알 수 없는 이벤트는 조용히 무시돼요.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### 이벤트 데이터 콘텐츠 디코딩

SSE 트랜스포트는 각 `data:` 페이로드를 텍스트로 전달해요. Defjs는 먼저 `events[eventName] ?? events.default`에서 이벤트 struct를 선택한 다음, 선택된 struct에 따라 텍스트를 디코딩해요.

서버가 이벤트에 대해 JSON 텍스트를 보낼 때는 `struct.json(inner)`를 사용하세요. `struct.json(inner)`는 먼저 원시 SSE 텍스트에 대해 `JSON.parse`를 실행한 다음, 나온 값을 `inner`로 파싱해요:

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

원시 텍스트 페이로드의 경우:

- `struct.string()`과 `struct.text()`는 원시 이벤트 텍스트를 그대로 읽어요.
- `struct.number()`는 텍스트를 트림하고 유한한 숫자 값만 허용해요.
- `struct.boolean()`는 텍스트를 트림하고 정확히 `true` 또는 `false`만 허용해요.

평범한 `struct.object(...)`, `struct.array(...)`, `struct.record(...)`는 스스로 JSON처럼 보이는 텍스트를 파싱하지 않아요. JSON 이벤트 데이터에는 반드시 `struct.json(...)`으로 감싸야 해요.

### 입력이 있는 이벤트 스트림

스트림에 경로 파라미터나 쿼리 파라미터, 요청 바디가 필요하면 `input` struct와 `build` 함수를 제공하세요. `build` 시그니처는 `defineRequest`와 동일하게 params, query, headers를 지원해요.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## 실행 결과

`client.execute()`는 SSE 커맨드에 대해 트리플릿을 반환해요:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — 연결 또는 검증 실패 시 non-null; 성공 시 `null`.
- **`stream`** — 성공 시 `for await...of`로 소비 가능한 `EventStreamHandle`; 실패 시 `undefined`.
- **`open`** — 첫 연결 응답 정보(`response`와 `url`)를 담고 있어요. 연결 실패 시 `undefined`일 수 있어요.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle과 stream.closed

`EventStreamHandle`은 `AsyncIterable`을 구현하므로 `for await...of`로 직접 사용할 수 있어요. 또한 다음 속성들을 제공해요:

| 속성 / 메서드              | 설명                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `open`                     | 첫 연결 `EventStreamOpenInfo`(`response`와 `url` 포함)          |
| `closed`                   | `Promise<EventStreamCloseInfo>`, 스트림이 완전히 닫히면 resolve |
| `close(reason?)`           | 스트림을 직접 닫음, 선택적으로 이유 전달                         |
| `[Symbol.asyncIterator]()` | 이벤트 큐를 소비하는 비동기 이터레이터 반환                     |

`closed`는 다음 상황에서 resolve돼요:

- 서버 정상 종료(`code: 'eof'`)
- `stream.close()`로 직접 닫음(`code: 'aborted'`)
- 연결 오류 또는 재연결 소진(`code: 'error'`)

```typescript
// 직접 닫기
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## 잘못된 이벤트 처리: onInvalidEvent

서버가 `events`(또는 `default`)의 어떤 struct와도 일치하지 않는 이벤트를 보내거나, struct 검증이 실패하면 `onInvalidEvent` 옵저버가 트리거돼요. 이것은 클라이언트 레벨 설정으로 `createClient` 시점에 `sse.onInvalidEvent`로 전달돼요.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: 검증 실패 시 원본 오류
    },
  }),
)
```

`onInvalidEvent`는 **옵저버**예요:

- 내부에서 예외를 던져도 조용히 무시되고 스트림은 계속돼요.
- 후속 이벤트 소비를 차단하지 않아요.

흔한 검증 실패 원인 중 하나는 이벤트의 `data:` 필드가 JSON 텍스트인데 `struct.object(...)`로 선언한 경우예요. 대신 `struct.json(struct.object(...))`로 선언하세요. `struct.json(...)` 아래에서 유효하지 않은 JSON은 `validation-failed`로 보고되며 원시 텍스트로 재시도하지 않아요.

## 재연결과 큐 설정

SSE 트랜스포트는 내장 자동 재연결 기능을 가지고 있으며, 클라이언트 레벨의 `sse.reconnect`와 `sse.queue`로 설정할 수 있어요.

### 재연결 설정

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // 최대 재시도 횟수
      delayMs: 1000, // 초기 재시도 간격
      factor: 2, // 지수 백오프 배율
      maxDelayMs: 30000, // 최대 재시도 간격
      jitter: 1000, // 랜덤 지터 범위(ms)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

재연결 우선순위:

1. `onerror`가 `null`을 반환하면 재연결을 멈춰요.
2. `shouldReconnect`가 `false`를 반환하면 재연결을 멈춰요.
3. `attempts` 제한을 초과하면 재연결을 멈춰요.
4. 그 외에는 `delayMs` + `factor` 지수 백오프 + `jitter`로 다음 재시도 간격을 계산해요.

> 재연결은 자동으로 `Last-Event-ID` 헤더를 가져가서 서버가 중단점부터 재개할 수 있게 해요.

### 큐 설정

이벤트는 도착 후 내부 비동기 큐에 들어간 다음 이터레이터가 소비해요. 큐 크기와 오버플로우 동작을 제한할 수 있어요:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | 동작                                               |
| ------------- | -------------------------------------------------- |
| `drop-newest` | 새로 도착한 이벤트를 폐기, 큐에 오래된 이벤트 유지 |
| `drop-oldest` | 오래된 이벤트를 폐기, 새 이벤트를 위한 공간 확보   |
| `error`       | 큐가 가득 차면 오류를 던져 스트림을 닫음           |

## 전체 예제

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## 다음 단계

- [클라이언트 →](/core/client) — `createClient`와 `sse` 옵션
- [커맨드 →](/core/commands) — 커맨드 정의와 입력 규칙
- [WebSocket →](/core/web-socket) — WebSocket 연결과 상태 관리
