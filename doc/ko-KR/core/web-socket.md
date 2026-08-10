---
title: WebSocket
description: 메시지 envelope를 정의하고 라이브 세션을 시작·관찰하며 incoming 작업을 소비하고 명시적 재연결과 heartbeat를 설정하고 소유한 리소스를 닫습니다.
---

# WebSocket

`defineWebSocket(...)`은 JSON 메시지 WebSocket 엔드포인트용 커맨드 빌더를 만듭니다.

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## 메시지 envelope

모든 메시지는 비어 있지 않은 string `type`을 가진 JSON 객체를 사용합니다. 이 type으로 `incoming` 또는 `outgoing`의 Struct를 선택합니다.

object payload의 필드는 `type` 옆에 둘 수 있습니다.

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

scalar 또는 배열 payload는 `data`에 넣습니다.

```json
{ "type": "count", "data": 3 }
```

`type`과 `data`는 예약된 envelope key입니다. object payload 자체에 `data` 필드가 있다면 런타임이 그 필드를 envelope payload로 오인하지 않도록 payload 전체를 감싸세요.

```typescript
const audit = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

이에 대응하는 wire 형태는 `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`입니다.

`type`을 일반 payload 필드로 선언하지 마세요. envelope 정규화가 이 key를 소유합니다.

선택적인 `incoming.default` Struct는 그 외에 선언되지 않은 메시지 type을 처리합니다. 없으면 알 수 없는 type을 버립니다.

## 시작 튜플

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

HTTP, SSE, WebSocket 실행의 `timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 하며, `0`, 음수, 소수, `NaN`, `Infinity`, 상한을 넘는 값은 request, stream, socket 리소스를 만들기 전에 `REQUEST_VALIDATION_FAILED`를 반환합니다.

WebSocket은 다음 값을 반환합니다.

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

성공할 때 세 번째 요소는 `generation: 1`인 시작 connection 스냅샷입니다. 첫 물리 socket의 `url`, `protocol`, `extensions`를 포함할 수 있습니다.

`session.connection`은 라이브 getter이며 물리 socket이 성공적으로 열릴 때마다 `generation`이 증가합니다. 시작 스냅샷이 중요하면 튜플의 세 번째 요소를 보관하세요.

connection URL은 로그에 남기지 마세요. path identifier, 애플리케이션 query 데이터, telemetry propagation 필드가 포함될 수 있습니다.

## 라이브 세션

`WebSocketSession` 하나는 여러 물리 연결 시도에 걸쳐 유지되는 논리 세션입니다.

| Member                     | 동작                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `connection`               | 현재의 최신 connection 정보입니다.                                |
| `bufferedAmount`           | native socket의 미전송 byte 수이며 socket이 없으면 `0`입니다.     |
| `state`                    | 현재의 논리 세션 state입니다.                                     |
| `receive`                  | 검증된 incoming 메시지의 공유 비동기 작업 큐입니다.               |
| `send(message)`            | 쓰기 가능성을 확인한 뒤 검증·직렬화하고 전송하거나 큐에 넣습니다. |
| `close(code?, reason?)`    | 최종 종료를 요청합니다.                                           |
| `closed`                   | 관찰된 최종 종료 정보에 대한 promise입니다.                       |
| `onStateChange(listener)`  | state observer를 추가하고 unsubscribe 함수를 반환합니다.          |
| `onRuntimeError(listener)` | 런타임 오류 observer를 추가하고 unsubscribe 함수를 반환합니다.    |

클라이언트는 세션을 반환한 뒤 이를 추적하지 않습니다. 호출자가 메시지 소비, observer, 취소, 종료를 소유합니다.

## 메시지 수신

text, ArrayBuffer, typed-array, Blob 메시지는 도착 순서대로 UTF-8 JSON으로 디코딩합니다. 다음 입력은 조용히 버립니다.

- 객체가 아닌 envelope
- 누락됐거나 빈 string인 `type`
- `incoming.default` Struct가 없고 알 수 없는 type

잘못된 JSON과 선택된 Struct 검증 실패는 `onRuntimeError`로 보내며 frame은 버리고 세션은 계속됩니다.

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

`receive`는 iterator 하나만 허용합니다. `maxIncomingQueueSize`는 필수 양의 item 한도이며 overflow는 buffer를 비우고 iterator를 실패시키며 세션을 `error`로 종료합니다.

## 메시지 전송

`send(...)`는 동기 함수입니다. 다음 경우 동기적으로 throw할 수 있습니다.

- 엔드포인트에 `outgoing` map이 없는 경우
- 메시지에 유효한 `type`이 없는 경우
- type이 선언되지 않은 경우
- payload 구조 디코딩 또는 인코딩에 실패한 경우
- 재연결 중 endpoint-owned outgoing queue가 비활성화되었거나 가득 찬 경우
- 즉시 전송 중 native socket이 throw하는 경우

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

payload 검증과 직렬화 전에 논리적 쓰기 가능성을 확인합니다. 논리 state와 현재 물리 socket이 모두 `open`일 때만 직접 전송합니다. `reconnecting`이고 엔드포인트의 `maxOutgoingQueueSize`가 양수일 때만 enqueue합니다. 보존된 FIFO는 replacement socket이 `open`을 알리기 전에 flush됩니다.

수동 closing, 최종 state, remote close 뒤 reconnect predicate가 결정되지 않은 구간에서는 `send`가 `InvalidStateError`를 throw합니다. 트랜스포트는 이전 물리 socket에 이미 보낸 frame을 replay하지 않습니다.

## State

`session.state`는 다음 값 중 하나입니다.

| State          | 의미                                              |
| -------------- | ------------------------------------------------- |
| `idle`         | 실행이 시작되기 전의 초기 내부 상태입니다.        |
| `connecting`   | 첫 물리 연결 시도가 시작됩니다.                   |
| `open`         | 현재 물리 socket이 열려 있습니다.                 |
| `reconnecting` | 다음 물리 연결 시도를 준비하거나 delay 중입니다.  |
| `closing`      | 소유자가 수동 close를 요청했습니다.               |
| `closed`       | 정규화된 오류가 없는 최종 종료입니다.             |
| `aborted`      | 외부 취소가 `ABORTED`로 정규화된 최종 상태입니다. |
| `error`        | 그 외 최종 실패입니다.                            |

`session.state`는 논리 생명주기이며 현재 native socket이 존재한다는 증거가 아닙니다. `reconnecting` 동안 `send`는 endpoint-owned outgoing capacity를 사용합니다.

observer 실패는 격리됩니다. state-listener 실패는 runtime-error listener에 전달되고, runtime-error listener 실패는 사용 가능한 `globalThis.reportError`로 전달됩니다. 최종 settle은 observer를 해제하지만 소유자가 더 일찍 끝나면 구독 해제하세요.

### 각 시도 전 실행

`beforeConnect`는 클라이언트 또는 실행 하나에 설정할 수 있습니다. 첫 시도와 모든 재연결 시도에서 native constructor를 호출하기 전에 실행됩니다.

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

hook은 `{ attempt, signal }`을 받습니다. 첫 `attempt`는 `0`이고 재연결마다 증가합니다. 소유한 비동기 작업에 `signal`을 전달하세요. abort와 timeout은 hook과 race하고 늦은 rejection을 소비하며 늦은 결과로 socket이 만들어지는 것을 막습니다. throw 또는 rejection은 최종 트랜스포트 실패입니다.

## 재연결은 명시적으로 켜야 합니다

reconnect 객체가 없으면 재연결하지 않습니다. 클라이언트별 또는 실행별로 설정하세요.

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

`attempts`는 첫 시도 이후의 재시도 횟수입니다. 빈 객체를 전달하면 다음 기본값으로 세 번 재시도합니다.

| 필드              | 기본값                           |
| ----------------- | -------------------------------- |
| `attempts`        | `3`                              |
| `delayMs`         | `1000`                           |
| `factor`          | `2`                              |
| `maxDelayMs`      | `30000`                          |
| `jitter`          | `0`                              |
| `shouldReconnect` | 모든 close outcome에 `true` 반환 |

기본 predicate는 clean과 unclean remote close를 모두 재시도합니다. clean close가 최종 종료여야 한다면 predicate를 설정하세요. 첫 재시도에서 `attempt`는 1입니다.

base delay는 `min(delayMs * factor ** (attempt - 1), maxDelayMs)`입니다. WebSocket jitter는 곱셈 방식입니다. 예를 들어 `0.2`는 `0.8`부터 `1.2` 사이의 임의 factor를 선택합니다. millisecond를 더하는 SSE jitter와 다릅니다.

`shouldReconnect`는 동기식입니다. throw는 세션을 `error`로 종료하고 명시적 `false`는 `closed`로 종료합니다. 재연결은 같은 논리 세션에 새 물리 socket만 만들며 이전 send를 replay하지 않습니다. `session.connection.generation`이 증가하면 여전히 active하고 안전하게 replay할 수 있는 subscription만 복원하고 mutation은 replay하지 마세요.

## Heartbeat

heartbeat도 opt-in입니다.

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

`message`는 엔드포인트의 outgoing map에 유효한 값을 만들어야 합니다. `isAck`가 확인한 메시지는 heartbeat timeout을 해제하며 `receive`에 추가되지 않습니다.

heartbeat 직렬화, send, ack predicate, timeout 실패는 모두 fatal입니다. runtime-error listener에 알리고 `receive`를 실패시키며 reconnect policy를 묻지 않고 세션을 `error`로 종료합니다.

`intervalMs`와 정의된 `timeoutMs`는 각각 양의 유한 값이며 `2_147_483_647` 이하여야 합니다. ack deadline이 활성인 동안 이후 interval은 새 ping을 보내거나 deadline을 재설정하지 않습니다. ack 또는 session stop이 deadline을 지웁니다.

## 큐

큐 한도는 endpoint 정의에 속합니다. `maxIncomingQueueSize`는 필수 양의 safe integer이며 overflow는 버퍼 값을 폐기하고 세션을 종료하는 fatal error입니다. `maxOutgoingQueueSize`는 선택적인 0 이상의 safe integer이고 기본값은 `0`입니다. 양수이면 연결 시도 사이의 frame을 FIFO로 보존하고, 오래된 frame을 버리지 않은 채 overflow를 거부합니다.

두 한도는 byte가 아니라 item 수를 셉니다. `session.bufferedAmount`는 native socket의 미전송 byte를 별도로 노출합니다. `receive`는 iterator 하나만 허용합니다.

## 종료 소유권

`session.close(code, reason)`은 먼저 code가 `1000` 또는 `3000..4999`이고 reason이 UTF-8 최대 123 byte인지 검증합니다. 유효한 입력은 `closing`으로 이동하고 native close를 요청한 뒤 실제 `CloseEvent`를 기다립니다. 관찰한 code/reason이 요청값보다 우선합니다.

`session.closed`는 런타임이 관찰한 close 정보로 resolve됩니다.

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

수동 close, cause 없는 remote close, 명시적으로 거부된 reconnect는 `closed`가 됩니다. 외부 abort는 `aborted`, timeout과 runtime failure는 `error`입니다. native close가 throw하면 인자 없이 한 번만 fallback하고, 둘 다 실패하면 세 번째 close 없이 `error`로 settle합니다.

listener 구독을 해제하고 해당 세션을 연 component, route, job 또는 service 경계에서 닫으세요. provider unmount만으로 이 작업이 수행되지는 않습니다.

## URL과 인증 안전성

HTTP base URL은 WebSocket scheme으로 변환됩니다. `http:`는 `ws:`, `https:`는 `wss:`가 됩니다. raw path-placeholder 값을 전달하세요. Core는 각 segment를 정확히 한 번 encode하고 `%`를 `%25`로 바꾸며 빈 값, `.`, `..`를 거부합니다. query 값은 설정된 serializer를 사용합니다.

protocol 우선순위는 실행 옵션, 클라이언트 옵션, 엔드포인트 정의 순서입니다. 명시적인 빈 protocol 배열은 우선순위가 낮은 값을 막습니다.

브라우저 WebSocket API는 임의 handshake header를 설정할 수 없습니다. query parameter를 일반적인 credential channel로 취급하지 마세요. URL은 브라우저 도구, proxy, access log, telemetry 시스템에 기록될 수 있습니다. TLS(`wss:`)와 배포 환경에서 검토한 인증 설계를 사용하세요. 적절한 same-site cookie 흐름이나 수명이 짧은 connection ticket이 그 예입니다.

## 다음 단계

- [SSE](/ko-KR/core/sse)에서는 stream retry와 queue 동작을 비교합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 라이브 session getter를 보존하는 방법을 보여 줍니다.
- [오류](/ko-KR/core/errors)에서는 시작 튜플 실패를 설명합니다.
