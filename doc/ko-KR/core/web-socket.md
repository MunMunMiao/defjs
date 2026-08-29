---
title: WebSocket
description: 타입이 잡힌 JSON 세션을 시작하고, envelope를 받고 보낸 뒤 닫고 closed를 await 해요.
---

# WebSocket

시작 → 수신 → 송신 → `await using`으로 해제하세요. Unsubscribe와 disposal은 호출하는 쪽이 소유해요. 수동 `close()` / `closed`도 그대로 쓸 수 있고, 클라이언트, provider, 인터셉터는 세션을 자동으로 닫지 않아요.

## Basic Setup

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, session, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using ownedSession = session
  const unsubscribe = ownedSession.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    ownedSession.send({ type: 'send', text: 'Hello' })
    for await (const message of ownedSession.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## JSON envelope

`defineWebSocket(...)`는 JSON 메시지 엔드포인트를 설명해요. 필수 `incoming` 맵이 메시지 타입으로 Struct를 고르고, 선택 `outgoing`은 `session.send(...)`에 같은 일을 해요. 모든 와이어 메시지는 비어 있지 않은 문자열 `type`이 있는 객체예요.

객체 페이로드 필드는 `type` 옆에 있어요. 스칼라와 배열 페이로드는 envelope의 `data` 필드를 써요.

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

메시지 맵은 페이로드를 제어하고, envelope discriminator는 제어하지 않아요. `incoming.default`는 그 외 미선언 타입 이름을 받아요. 없으면 알 수 없는 타입은 버려요. 들어오는 텍스트, `ArrayBuffer`, typed-array, `Blob` 프레임은 UTF-8 JSON으로 디코딩돼요. 잘못된 JSON과 Struct 실패는 `receive`가 아니라 런타임 오류 옵저버로 가요.

객체 페이로드에 `data`라는 필드가 있으면 인코딩 후에도 `type` 옆에 남아요 (중첩 envelope가 아님). 예: `{ data: string, source: string }`인 `write`는 `{ type: 'write', data: string, source: string }`으로 와이어에 올라가요. 호출 쪽 값은 직렬화 전에 `data`가 객체 페이로드를 나르므로 여전히 `{ type: 'write', data: { data, source } }`예요. 별칭은 페이로드 필드에 적용돼요. `type` discriminator는 Struct가 아니라 envelope에 속해요.

`session.send(...)`는 동기적으로 검증하고 직렬화해요. open이면 즉시 보내고, outgoing 큐가 켜져 있으면 `reconnecting` 동안 큐에 넣고, 쓸 수 없으면 `InvalidStateError`를 던져요. outgoing 맵이 없거나, 미선언 타입이거나, 페이로드 검증 실패이거나, outgoing 큐가 꺼졌거나 가득 찼거나, 네이티브 send 실패일 때도 던져요.

`receive`는 소비자 하나예요. 두 번째 iterator는 거부돼요.

## 상태 스냅샷

| Member                     | Meaning                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `state`                    | `idle`, `connecting`, `open`, `reconnecting`, `closing`, `closed`, `aborted`, 또는 `error` |
| `connection`               | 최신 물리 연결: `generation`, URL, 협상된 프로토콜, 가능하면 extensions                    |
| `bufferedAmount`           | 네이티브 미전송 바이트 수, 물리 소켓이 없으면 `0`                                          |
| `receive`                  | 검증된 수신 메시지의 소비자 하나 async iterable                                            |
| `onStateChange(listener)`  | 논리 상태 전환 구독; unsubscribe 반환                                                      |
| `onRuntimeError(listener)` | 시작이 아닌 런타임 오류 구독; unsubscribe 반환                                             |
| `closed`                   | 논리 종료 close 결과의 프로미스                                                            |

`open` = 물리 소켓 open. `reconnecting`은 교체 전 준비 + 지연을 포함해요. `connection.generation`은 `open`에 도달한 물리 소켓마다 증가해요. 튜플 `startupConnection`은 첫 성공 스냅샷으로 남고, `session.connection`은 앞으로 이동해요.

시작 실패 → `[error, undefined, connection?]`. open 전 생성자 실패는 연결이 없을 수 있고, 시작 중 타임아웃/close는 스냅샷을 줄 수 있어요. 세션이 반환된 뒤 런타임 오류는 옵저버, `receive`, `closed`로 가고 — 두 번째 execute 튜플로는 가지 않아요.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## 재연결

재연결은 opt-in이에요. `reconnect` 객체가 없으면 물리 close가 논리 세션을 끝나요. 설정하면 기본값은 `attempts: 3`, `delayMs: 1000`, `factor: 2`, `maxDelayMs: 30000`, `jitter: 0`이에요. `attempts`는 최초 시도 이후 재시도 횟수이고, `attempts: 0`은 꺼요. 기본 predicate는 모든 close 결과를 수락해요.

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect`는 다음 재시도 시도, close cause, code, reason, `wasClean`을 받아요. 수동 `session.close(...)`는 predicate에 들어가지 않아요. 준비/정책 throw는 논리 세션을 오류로 끝나요.

WebSocket backoff jitter는 **곱셈**이에요 (`jitter: 0.2` → 지연이 `0.8x`~`1.2x`). SSE jitter는 WebSocket과 같은 0–1 곱셈 인자예요. delay/factor/jitter/attempt 값은 생성자 전에 검증되고, 타이머 지연은 `2_147_483_647` ms를 넘을 수 없어요.

`beforeConnect({ attempt, signal })`는 최초 생성자와 모든 재연결 전에 돌아요. 취소를 준비와 연결 모두에 멈추게 하려면 그 signal을 토큰 갱신에 넘기세요.

## Heartbeat

execute나 클라이언트 범위에서 opt-in이에요. 간격마다 outgoing Struct 맵을 통해 `message()`를 보내요. 선택 `isAck(message)`가 ack을 인식하면 — 그 메시지는 타임아웃을 지우고 `receive`로 **전달되지 않아요**.

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs`와 `timeoutMs`는 `2_147_483_647` 이하의 양의 유한 타이머여야 해요. heartbeat 메시지는 outgoing 맵에 유효해야 해요. 직렬화, 네이티브 send, ack 분류, 타임아웃 실패는 논리 세션에 치명적이에요 — 일반 재연결이 되지 않아요.

## 큐

| Setting                | Required value                       | Behavior                                                                                                     |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `maxIncomingQueueSize` | 양의 안전 정수                       | `receive`를 기다리는 파싱된 메시지와 transform을 기다리는 raw 프레임을 제한해요. 오버플로 → `state: 'error'` |
| `maxOutgoingQueueSize` | 선택적 음이 아닌 안전 정수; 기본 `0` | `state === 'reconnecting'`일 때만 FIFO. 가득 차거나 꺼지면 → `send(...)`가 throw                             |

큐에 쌓인 outgoing 프레임은 교체 소켓이 `open`을 발행하기 전에 flush돼요. 이전 소켓에 이미 보낸 프레임은 자동 재생되지 않아요. 재연결 큐는 재연결 중에 보내는 메시지용이지, 앱 상태를 재구성용이 아니에요.

수신 오버플로는 대기 시퀀스를 비우고, `receive`를 실패시키고, 세션을 멈추고, `session.closed`를 `kind: 'error'`로 resolve해요. 소비자를 충분히 빠르게 두거나 측정된 크기/메모리로 한도를 올리세요.

## 프로토콜과 인증

정의 `protocols`, 클라이언트 `withWebSocketProtocols(...)`, 실행 `protocols`가 생성자 서브프로토콜 목록을 설정해요. 우선순위: 실행 → 클라이언트 → 정의. 처음 정의된 목록이 논리 세션용으로 복사되고 재연결에서 재사용돼요.

브라우저 WebSocket 생성자는 임의 handshake 헤더를 받지 않아요. Defjs는 `http:` → `ws:`, `https:` → `wss:`로 바꾸고, path placeholder를 한 번만 인코딩하며, 설정된 query 직렬화기를 써요. WebSocket query 구성은 복잡한 query 값도 JSON으로 직렬화해요 (기본 HTTP의 스칼라 전용 query와 다름).

`withCredentials(true)`는 HTTP/SSE용 Fetch credentials이지 — WebSocket 인증이 아니에요. 검토된 쿠키/세션 정책, 서브프로토콜, 또는 짧은 수명의 연결 티켓을 쓰세요. 일반 자격 증명이나 긴 수명의 비밀을 query 문자열에 넣지 마세요.

## 종료와 소유권

`session.close(code?, reason?)`는 종료 close를 요청하고 heartbeat를 멈춰요. code는 `1000`이거나 `3000..4999`여야 하고, reason은 UTF-8 123바이트 이하여야 해요. 잘못된 close 인자는 상태를 바꾸기 전에 throw해요. 수동 close reason이나 논리 종료 결과가 필요하면 `await session.closed`와 함께 쓰세요.

```typescript twoslash
import type { WebSocketSession } from '@defjs/core'

async function observeSession(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  console.log(ownedSession.state)
}

void observeSession
```

`session.closed`는 논리 종료 스냅샷이에요. `kind`는 `'closed'`, `'aborted'`, `'error'`이고, 선택적 네이티브 `code` / `reason` / `wasClean`, aborted/error용 `cause`가 있어요. 관찰된 네이티브 close 필드가 소유자가 요청한 fallback보다 이겨요.

표준 async disposer는 best-effort 네이티브 close를 요청한 뒤 Defjs 소유 lifecycle, message pump, timer, listener, queue, socket reference teardown을 기다려요. 1초 안에 close event를 관찰하지 못하면 논리 cleanup을 강제로 마치고 `closed`는 수동 `'closed'` 결과로 settle하지만, disposer는 `TimeoutError`라는 이름의 `DOMException`으로 reject해요. 네이티브 close 호출 자체가 throw해도 cleanup 뒤 그 오류로 reject해요. 반복 disposer 호출은 같은 teardown을 공유해요. 어느 경우에도 물리 TCP 연결이 닫혔다는 사실까지 증명하지는 못해요.

구조적으로 session을 직접 구현한 코드는 이제 같은 `[Symbol.asyncDispose](): PromiseLike<void>` 계약을 제공해야 해요. 구현자에게는 컴파일 타임 breaking change고, Defjs session을 받기만 하는 소비자에게는 새 런타임 호출 요구가 없어요.

## GraphQL 경계

Defjs는 타입이 잡힌 JSON envelope와 논리 세션 수명을 제공해요. WebSocket 애플리케이션 프로토콜을 구현하지는 **않아요**. GraphQL-over-WebSocket 기능 — connection init, operation ID, `next`/`error`/`complete`, 해제, subscription 재생 — 은 core 계약 밖이에요.

서버가 그 프로토콜을 요구하면 `graphql-ws` 같은 프로토콜 클라이언트를 쓰거나, `defineWebSocket(...)`로 자체 envelope를 모델링하세요. 메시지 맵만으로는 GraphQL 의미를 협상하지 않아요.

## 관련 레시피

- [WebSocket 세션 열기](../recipes/websocket-session.md)
- [SSE 스트림 소비하기](../recipes/consume-sse.md)
