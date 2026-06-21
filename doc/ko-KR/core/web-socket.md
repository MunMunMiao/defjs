---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core`는 `defineWebSocket`으로 타입이 부여된 WebSocket 엔드포인트를 제공해요. 각 엔드포인트는 다음을 선언해요:

- `incoming` 스키마 — 서버가 클라이언트에게 보내는 메시지.
- `outgoing` 스키마 — 클라이언트가 서버에게 보내는 메시지.
- `input` 스키마 + `build` 핸들러 — 요청 파라미터와 쿼리/경로 구성(선택적).

메시지는 JSON 인코딩되고 선언된 스키마에 대해 런타임에 검증돼요.

## WebSocket 엔드포인트 정의

`defineWebSocket`으로 타입이 부여된 커맨드 빌더를 만들어요. 그런 다음 `client.execute()`로 실행해요.

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // 선택적: 입력으로 연결 URL을 빌드
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // 서버 → 클라이언트 메시지
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // 클라이언트 → 서버 메시지
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### 스키마 형태

**Incoming 메시지**는 `type` 키로 구분돼요. 메시지가 도착하면 JSON의 `type` 필드가 스키마 키와 일치하는지 확인해요. 페이로드가 평범한 객체이면 필드가 `type`과 병합돼요:

```typescript
// 서버가 보냄: { "type": "message", "text": "hi", "userId": 1 }
// 클라이언트가 받음: { type: 'message', text: 'hi', userId: 1 }
```

페이로드가 스칼라나 배열이면 `data` 아래에 감싸져요:

```typescript
// 서버가 보냄: { "type": "notification", "data": [1, 2, 3] }
// 클라이언트가 받음: { type: 'notification', data: [1, 2, 3] }
```

**Outgoing 메시지**도 같은 규칙을 따릅니다. `send()` 메서드는 `outgoing` 키 중 하나와 일치하는 `type`을 가진 메시지를 받아요:

```typescript
socket.send({ type: 'message', text: 'hello' })
```

`incoming`에 `default` 키를 사용하여 선언되지 않은 메시지 타입을 공통 스키마로 잡을 수 있어요.

## 실행과 메시지 소비

`client.execute()`는 `[error, socket, connection]` 튜플을 반환해요:

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // 시작 실패 처리(검증, 트랜스포트, 중단 등)
  return
}

// 수신 메시지 순회
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// 또는 비동기 이터레이터를 직접 사용
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## `WebSocketSession` API

| 멤버                       | 타입                                       | 설명                                                             |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | 기본 소켓의 `{ url?, protocol?, extensions? }`.                  |
| `state`                    | `WebSocketState`                           | 현재 생명주기 상태(아래 참조).                                   |
| `receive`                  | `AsyncIterable<TIncoming>`                 | 검증된 수신 메시지의 비동기 이터레이터.                          |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | 소켓이 닫히면 `{ code?, reason?, wasClean?, cause? }`로 resolve. |
| `send(message)`            | `(message: TOutgoing) => void`             | 송신 메시지 전송. 아직 열리지 않았으면 큐에 들어감.              |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | 우아하게 연결을 닫음.                                            |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | 구독 해제 함수 반환.                                             |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | 구독 해제 함수 반환.                                             |

```typescript
// 상태 모니터링
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// 런타임 오류(스키마 실패, 하트비트 타임아웃 등)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// 우아한 닫기
socket.close(1000, 'done')
await socket.closed
```

## 연결 생명주기 상태 머신

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| 상태           | 의미                                                            |
| -------------- | --------------------------------------------------------------- |
| `idle`         | `execute()` 호출 전.                                            |
| `connecting`   | 첫 연결 시도 중.                                                |
| `open`         | 연결 성립, 메시지 흐름 가능.                                    |
| `closing`      | `close()` 또는 `abort`가 트리거되고 close 이벤트를 기다리는 중. |
| `closed`       | 깨끗한 종료(오류 없음 또는 수동 종료).                          |
| `reconnecting` | 연결 끊김, 재시도 전 대기 중.                                   |
| `error`        | 종료 실패(검증 오류, 트랜스포트 오류, 중단이 아닌 종료 원인).   |
| `aborted`      | `AbortSignal` 또는 `close()`로 명시적 중단.                     |

상태 전환은 `onStateChange`를 통해 발생해요. `receive` 비동기 이터레이터는 소켓이 종료 상태(`closed`, `error`, `aborted`)에 도달하면 종료돼요.

## 하트비트

주기적인 ping/ack를 설정하여 연결을 유지하거나 죽은 피어를 감지하세요.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // 30초마다 전송
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // 10초 내에 ack 기대
    isAck: (message) => message.type === 'pong',
  },
})
```

| 옵션         | 설명                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `intervalMs` | 하트비트 전송 간격(필수).                                             |
| `message`    | 하트비트 메시지를 반환하는 팩토리. `TOutgoing`에 대해 타입화됨.       |
| `timeoutMs`  | 설정하면 ACK가 시간 내에 도착하지 않으면 코드 `4000`으로 소켓이 닫힘. |
| `isAck`      | 수신 메시지가 하트비트 ack인지 판정하는 술어.                         |

하트비트는 클라이언트 레벨(`createClient({ webSocket: { heartbeat: ... } })`)이나 요청 레벨(`execute()` 옵션)으로 설정할 수 있어요. 요청 레벨 설정이 우선해요.

## 재연결

연결이 예기치 않게 끊어지면 자동 재연결이 트리거돼요.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| 옵션              | 기본값       | 설명                                             |
| ----------------- | ------------ | ------------------------------------------------ |
| `attempts`        | `3`          | 최대 재시도 횟수. `<= 0`이면 재연결 비활성화.    |
| `delayMs`         | `1000`       | 첫 재시도 전 기본 지연.                          |
| `factor`          | `2`          | 지수 백오프 배율.                                |
| `maxDelayMs`      | `30000`      | 계산된 지연의 상한.                              |
| `jitter`          | `0`          | 랜덤화 계수(`0`–`1`).                            |
| `shouldReconnect` | `() => true` | 주어진 종료가 재시도를 트리거할지 결정하는 술어. |

지연 공식: `min(delayMs * factor^(attempt - 1), maxDelayMs)`, 그런 다음 지터 적용.

재연결은 클라이언트 레벨(`createClient({ webSocket: { reconnect: ... } })`)로도 설정 가능해요.

## 전송 큐

소켓이 `open`되기 전(또는 일시적 연결 끊김 동안)에 전송된 메시지는 큐에 들어가 연결이 준비되면 플러시돼요.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| 옵션       | 설명                                |
| ---------- | ----------------------------------- |
| `maxSize`  | 최대 큐 메시지 수. 기본값은 무제한. |
| `overflow` | `maxSize` 초과 시 동작.             |

큐는 종료 종료(`error`, `aborted`, `closed`) 시 지워져요.

## 수동 종료와 중단 동작

### `socket.close(code?, reason?)`

우아한 종료를 수행해요:

1. 네이티브 `WebSocket.close(code, reason)`을 호출해요.
2. `manual-web-socket-close` 이유로 내부 `AbortController`를 중단해요.
3. 소켓은 `closing` → `closed`로 전환돼요.
4. `socket.closed`는 제공된 `code`와 `reason`으로 resolve돼요.

### `AbortSignal` (외부)

`execute()` 옵션을 통해 외부 `AbortSignal`을 전달하세요:

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// 나중에:
controller.abort() // 즉시 소켓을 닫고 'aborted'로 전환
```

소켓이 열리기 **전**에 중단하면 `execute()`는 트랜스포트 오류와 함께 `socket`이 `undefined`인 상태로 resolve돼요. 열린 **후**에 중단하면 소켓은 `aborted`로 전환하고 `receive`가 종료돼요.

### `timeout`

요청 레벨 타임아웃은 지원되지만 같은 요청에 `abort`와 함께 사용할 수는 없어요(정의 오류 반환):

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// 오류 — abort와 timeout을 혼합할 수 없음
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## 전체 예제

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## 다음 단계

- [SSE →](/core/sse) — 타입 스키마와 재연결이 있는 Server-Sent Events.
- [클라이언트 →](/core/client) — 클라이언트 생성과 WebSocket 설정.
- [커맨드 →](/core/commands) — `defineWebSocket` 입력과 빌드 규칙.
