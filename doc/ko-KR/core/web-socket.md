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

WebSocket은 다음 값을 반환합니다.

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

성공할 때 세 번째 요소는 시작 시점 connection 스냅샷입니다. 첫 번째 물리 socket이 열릴 때 캡처한 `url`, `protocol`, `extensions`를 포함할 수 있습니다.

`session.connection`은 라이브 getter입니다. 재연결은 기반 물리 socket을 교체하며 이 값을 갱신할 수 있습니다. 시작 스냅샷이 중요하면 튜플의 세 번째 요소를 보관하세요.

connection URL은 로그에 남기지 마세요. path identifier, 애플리케이션 query 데이터, telemetry propagation 필드가 포함될 수 있습니다.

## 라이브 세션

`WebSocketSession` 하나는 여러 물리 연결 시도에 걸쳐 유지되는 논리 세션입니다.

| Member                     | 동작                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `connection`               | 현재의 최신 connection 정보입니다.                             |
| `state`                    | 현재의 논리 세션 state입니다.                                  |
| `receive`                  | 검증된 incoming 메시지의 공유 비동기 작업 큐입니다.            |
| `send(message)`            | outgoing 메시지를 검증·직렬화한 뒤 전송하거나 큐에 넣습니다.   |
| `close(code?, reason?)`    | 최종 종료를 요청합니다.                                        |
| `closed`                   | 관찰된 최종 종료 정보에 대한 promise입니다.                    |
| `onStateChange(listener)`  | state observer를 추가하고 unsubscribe 함수를 반환합니다.       |
| `onRuntimeError(listener)` | 런타임 오류 observer를 추가하고 unsubscribe 함수를 반환합니다. |

클라이언트는 세션을 반환한 뒤 이를 추적하지 않습니다. 호출자가 메시지 소비, observer, 취소, 종료를 소유합니다.

## 메시지 수신

text, ArrayBuffer, typed-array, Blob 메시지는 UTF-8 JSON으로 디코딩합니다. 다음 입력은 조용히 버립니다.

- 유효하지 않은 JSON
- 객체가 아닌 envelope
- 누락됐거나 빈 string인 `type`
- `incoming.default` Struct가 없고 알 수 없는 type

Struct를 선택한 뒤 디코딩에 실패하면 `onRuntimeError`로 보내고 해당 메시지는 버립니다.

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

incoming iterable은 무제한인 공유 작업 큐 하나입니다. iterator가 여러 개면 서로 메시지를 차지하며 독립적인 subscription이 아닙니다. 큐가 늘어나도 트랜스포트는 서버의 전송 속도를 늦추지 않습니다. incoming 메시지를 항상 소비하거나 세션을 즉시 닫으세요.

## 메시지 전송

`send(...)`는 동기 함수입니다. 다음 경우 동기적으로 throw할 수 있습니다.

- 엔드포인트에 `outgoing` map이 없는 경우
- 메시지에 유효한 `type`이 없는 경우
- type이 선언되지 않은 경우
- payload 구조 디코딩 또는 인코딩에 실패한 경우
- 제한된 send queue가 `overflow: 'error'`를 사용하는 경우
- 즉시 전송 중 native socket이 throw하는 경우

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

open 전이나 재연결 시도 사이에 전송한 메시지는 outgoing send queue에 들어갑니다. 물리 socket이 열리면 큐를 비웁니다.

최종 상태 이후에는 `send`를 호출하지 마세요. 현재 구현은 종료 후 거부 동작을 안정적인 계약으로 제공하지 않으며, 최종 종료 후 큐에 들어간 데이터는 영원히 전송되지 않을 수 있습니다.

## State

`session.state`는 다음 값 중 하나입니다.

| State          | 의미                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | 실행이 시작되기 전의 초기 내부 상태입니다.                                                                                    |
| `connecting`   | 첫 물리 연결 시도가 시작됩니다.                                                                                               |
| `open`         | 물리 socket이 열린 뒤 마지막으로 emit된 논리 상태입니다. 재연결 대기 중에는 물리 socket이 없어도 `open`으로 남을 수 있습니다. |
| `reconnecting` | delay 후 다음 물리 연결 시도가 시작됩니다.                                                                                    |
| `closing`      | 취소에 따라 활성 connecting/open socket을 닫고 있습니다.                                                                      |
| `closed`       | 정규화된 오류가 없는 최종 종료입니다.                                                                                         |
| `aborted`      | 외부 취소가 `ABORTED`로 정규화된 최종 상태입니다.                                                                             |
| `error`        | 그 외 최종 실패입니다.                                                                                                        |

`reconnecting`은 delay 중에는 emit되지 않습니다. delay가 끝나 다음 시도가 시작될 때 emit됩니다. `session.state`는 마지막으로 emit된 생명주기 상태일 뿐, 현재 native socket이 존재한다는 증거가 아닙니다. 이 공백 동안 보낸 메시지는 outgoing queue에 들어갑니다.

state listener는 직접 실행됩니다. throw하지 않게 작성하고 소유 범위가 끝나면 구독 해제하세요.

### 각 시도 전 실행

`beforeConnect`는 클라이언트 또는 실행 하나에 설정할 수 있습니다. 첫 시도와 모든 재연결 시도에서 native constructor를 호출하기 전에 실행됩니다.

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

커맨드 입력과 요청 프로젝션은 이미 구성된 상태입니다. 이 hook은 `build`를 다시 실행하거나 바인딩된 query 값을 바꾸지 않습니다. 환경의 handshake mechanism이 사용하는 상태를 갱신하는 등 애플리케이션이 소유하는 준비 작업에 사용하세요. throw 또는 rejection은 최종 트랜스포트 실패이며 close 결과를 판단하는 reconnect predicate로 전달되지 않습니다.

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

`shouldReconnect`는 동기식이고 throw하지 않게 작성하세요. 재연결은 같은 논리 세션 안에서 새 물리 socket을 여는 동작입니다. incoming 및 outgoing 큐는 그 논리 세션에 속합니다.

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

양수 `timeoutMs`가 지나면 런타임은 runtime-error listener에 `Error('WebSocket heartbeat timeout')`을 emit하고 native close code `4000`, reason `heartbeat timeout`을 요청합니다. 그래도 재연결하려면 결과 close를 허용하는 별도 reconnect 정책이 필요합니다.

`timeoutMs < intervalMs`로 유지하세요. 현재 구현은 이 관계를 검증하지 않으며 timeout이 interval 이상이면 이후 heartbeat timer와 겹칠 수 있습니다.

## 큐

`queue` 옵션은 outgoing 메시지만 설정합니다.

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

outgoing 큐는 기본적으로 무제한입니다. 제한하면 기본 overflow mode는 `drop-oldest`이고 다른 선택지는 `drop-newest`, `error`입니다. 최종 종료는 이 send queue를 비웁니다.

incoming 큐에는 공개된 size 제한이나 overflow 옵션이 없습니다. backpressure를 제공하지 않는 무제한 공유 작업 큐입니다. 리소스 소유자는 계속 소비하거나 세션을 닫아야 합니다.

## 종료 소유권

`session.close(code, reason)`은 현재 native socket의 `close` method를 호출하고 수동 종료 marker로 논리 세션을 abort합니다. 종료를 요청할 뿐 graceful handshake, 관찰 가능한 `closing` 상태 또는 최종 `closed` 값이 요청한 code와 reason을 정확히 반영한다는 보장은 없습니다.

`session.closed`는 런타임이 관찰한 close 정보로 resolve됩니다.

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

native 구현이 close event를 emit하지 않으면 settle이 지연될 수 있습니다. 외부 취소는 정규화된 reason에 따라 `aborted` 또는 `error`로 끝날 수 있고, 세션이 시도 사이에 있으면 `closing`을 건너뛸 수 있습니다.

listener 구독을 해제하고 해당 세션을 연 component, route, job 또는 service 경계에서 닫으세요. provider unmount만으로 이 작업이 수행되지는 않습니다.

## URL과 인증 안전성

HTTP base URL은 WebSocket scheme으로 변환됩니다. `http:`는 `ws:`, `https:`는 `wss:`가 됩니다. path placeholder는 segment encoding되지 않습니다. query 값은 설정된 serializer를 사용합니다.

protocol 우선순위는 실행 옵션, 클라이언트 옵션, 엔드포인트 정의 순서입니다. 명시적인 빈 protocol 배열은 우선순위가 낮은 값을 막습니다.

브라우저 WebSocket API는 임의 handshake header를 설정할 수 없습니다. query parameter를 일반적인 credential channel로 취급하지 마세요. URL은 브라우저 도구, proxy, access log, telemetry 시스템에 기록될 수 있습니다. TLS(`wss:`)와 배포 환경에서 검토한 인증 설계를 사용하세요. 적절한 same-site cookie 흐름이나 수명이 짧은 connection ticket이 그 예입니다.

## 다음 단계

- [SSE](/ko-KR/core/sse)에서는 stream retry와 queue 동작을 비교합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 라이브 session getter를 보존하는 방법을 보여 줍니다.
- [오류](/ko-KR/core/errors)에서는 시작 튜플 실패를 설명합니다.
