---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs는 `defineEventStream`으로 타입이 부여된 SSE(Server-Sent Events) 엔드포인트를 정의해요. 실행 후에는 `[error, stream, openInfo]` 트리플릿이 반환되며, `stream`은 서버 푸시 이벤트를 하나씩 소비하는 비동기 이터러블이에요.

## 이벤트 스트림 정의

SSE 엔드포인트를 정의할 때 `events` 필드를 선언하여 이벤트 이름을 struct 스키마에 매핑하세요. 각 이벤트 타입의 `data` 필드는 일치하는 스키마에 따라 자동으로 파싱돼요.

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.number(),
      text: struct.string(),
    }),
    heartbeat: struct.string(),
  },
})
```

### 기본 이벤트 스키마 (폴백)

서버가 `events`에 명시적으로 선언되지 않은 이벤트 타입을 보낼 수 있다면 `default` 스키마를 폴백으로 제공하세요. `default` 없이는 알 수 없는 이벤트는 조용히 무시돼요.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### 입력이 있는 이벤트 스트림

스트림에 쿼리 파라미터나 요청 바디가 필요하면 `defineRequest`와 마찬가지로 `input` 스키마와 `build` 함수를 제공하세요. `build` 시그니처는 `defineRequest`와 동일하게 파라미터, 쿼리, 헤더를 지원해요.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: {
    chat: struct.object({ user: struct.string(), text: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ roomId: '42' }))
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
  if (event.event === 'message') {
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
| `close(reason?)`           | 스트림을主动 닫음, 선택적으로 이유 전달                         |
| `[Symbol.asyncIterator]()` | 이벤트 큐를 소비하는 비동기 이터레이터 반환                     |

`closed`는 다음 상황에서 resolve돼요:

- 서버 정상 종료(`code: 'eof'`)
- `stream.close()`로主动 닫음(`code: 'aborted'`)
- 연결 오류 또는 재연결 소진(`code: 'error'`)

```typescript
//主动 닫기
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## 잘못된 이벤트 처리: onInvalidEvent

서버가 `events`(또는 `default`)의 어떤 스키마와도 일치하지 않는 이벤트를 보내거나, 스키마 검증이 실패하면 `onInvalidEvent` 옵저버가 트리거돼요. 이것은 클라이언트 레벨 설정으로 `createClient` 시점에 `sse.onInvalidEvent`로 전달돼요.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-schema' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: 검증 실패 시 원본 오류
    },
  },
})
```

`onInvalidEvent`는 **옵저버**예요:

- 내부에서 예외를 던져도 조용히 무시되고 스트림은 계속돼요.
- 후속 이벤트 소비를 차단하지 않아요.

## 재연결과 큐 설정

SSE 트랜스포트는 내장 자동 재연결 기능을 가지고 있으며, 클라이언트 레벨의 `sse.reconnect`와 `sse.queue`로 설정할 수 있어요.

### 재연결 설정

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
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
  },
})
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
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  },
})
```

| `overflow`    | 동작                                               |
| ------------- | -------------------------------------------------- |
| `drop-newest` | 새로 도착한 이벤트를 폐기, 큐에 오래된 이벤트 유지 |
| `drop-oldest` | 오래된 이벤트를 폐기, 새 이벤트를 위한 공간 확보   |
| `error`       | 큐가 가득 차면 오류를 던져 스트림을 닫음           |

## 전체 예제

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  },
})

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.object({ level: struct.string(), msg: struct.string() }),
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
    console.log(`[${event.data.level}] ${event.data.msg}`)
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
