---
title: SSE
description: Server-Sent Events를 정의하고 디코딩하며 시작을 처리하고 공유 이벤트 큐를 소비하고 재연결을 설정하고 소유한 스트림을 닫습니다.
---

# SSE

`defineEventStream(...)`은 SSE 커맨드 빌더를 만듭니다. 엔드포인트는 path와 각 이벤트 이름에 사용할 Struct를 선언합니다.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  path: '/notifications',
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

method 기본값은 `GET`입니다. 엔드포인트가 다른 method를 지정할 수는 있지만 high-level SSE build context는 요청 body를 지원하지 않습니다.

## 이벤트 디코딩

SSE parser는 먼저 `events[eventName]`을 선택하고, 없으면 `events.default`를 선택합니다. 둘 다 일치하지 않으면 이벤트를 버리고 선택적으로 등록한 invalid-event observer에 `missing-struct`를 보고합니다.

SSE `data:`는 text로 들어옵니다.

- `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()`은 text를 받습니다.
- `struct.number()`는 text를 trim한 뒤 finite number를 받습니다.
- `struct.boolean()`은 text를 trim한 뒤 `true` 또는 `false`만 받습니다.
- `struct.json(inner)`는 JSON text를 parse한 다음 `inner`로 구조적 디코딩합니다.

`struct.object(...)`만 사용하면 JSON처럼 보이는 이벤트 text를 parse하지 않습니다. `struct.json(...)`으로 감싸세요.

`default` Struct는 그 외에 선언되지 않은 이름을 처리합니다.

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

`default` Struct가 없으면 `EventStreamData<TEvents>`는 선언된 event 이름으로 구성된 판별 union입니다. `event.event`를 기준으로 분기하면 `event.data`는 대응하는 Struct의 출력 타입으로 좁혀집니다. `default`가 있으면 해당 분기는 wire상의 실제 event 이름을 `event: string`으로 유지합니다. 따라서 알려진 event와 `default`를 함께 사용하는 스트림에는 이 넓은 fallback 분기가 유지됩니다.

## 입력과 요청 매핑

path, query, header section에는 `struct.request(...)`를 사용합니다.

```typescript
const roomEvents = defineEventStream({
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

사용자 정의 SSE `build`는 path parameter, query parameter, header를 설정할 수 있습니다. 스키마에 결합된 프로젝션을 받으며 body나 credentials는 설정할 수 없습니다. credentials는 클라이언트의 `withCredentials(...)`로 설정하세요.

## 시작 튜플

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

SSE는 다음 값을 반환합니다.

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

성공할 때 세 번째 요소는 검증을 통과한 시작 시점 open 스냅샷입니다. 이 스냅샷의 응답은 HTTP status와 `text/event-stream` content type 검사를 통과했습니다.

`stream.open`은 라이브 getter입니다. 이후 재연결에서 status나 content-type 검증에 실패한 응답까지 포함해 논리 스트림이 마지막으로 받은 응답을 담습니다. 초기 스냅샷이 중요하면 `startupOpen`을 따로 보관하세요.

기본적으로 `startupOpen.url`, `stream.open.url`, 응답 URL을 로그에 남기지 마세요. 민감한 path 또는 query 데이터가 포함될 수 있습니다.

## 이벤트 소비

소유자는 같은 생명주기 안에서 순회를 시작하고 종료를 준비해야 합니다.

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

성공한 `execute`는 시작이 완료됐다는 뜻입니다. 시작 이후 오류는 원래 튜플의 `error`를 바꾸지 않고 iterator rejection과 `stream.closed`를 통해 나타납니다.

## 유효하지 않은 이벤트

`withSSEOnInvalidEvent(...)` 또는 `withSSEOptions(...)`로 `onInvalidEvent`를 설정합니다.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

observer는 다음 값을 받습니다.

- `reason: 'missing-struct' | 'validation-failed'`
- 원본 event `id`, 이름, data text, 선택적인 retry 값
- 검증 실패의 `cause`

이 이벤트는 버립니다. 이후 유효한 이벤트는 계속 전달될 수 있습니다. observer의 throw와 reject는 잡아서 처리하지만, 비동기 observer는 이후 메시지 처리를 계속하기 전에 await합니다. 빠르게 끝나도록 작성하세요. 원본 `id`, `data`, `cause`를 기록하기 전에 검토하고 민감 정보를 마스킹하세요.

## 재연결

SSE는 네트워크 오류와 stream read 실패를 재시도하는 기본 동작이 있습니다. 정상 EOF는 `code: 'eof'`로 스트림을 닫으며 재연결하지 않습니다.

기본 재시도는 1초부터 시작하고 횟수 제한이 없습니다. `attempts`로 제한하세요.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts`는 최초 시도 이후의 재시도 횟수입니다. `attempts: 0`은 재시도를 끕니다. `shouldReconnect`에 전달되는 `attempt`는 첫 재시도에서 1로 시작해 논리 스트림 전체에서 누적됩니다. 물리 연결이 성공해도 reset되지 않습니다.

delay는 현재 retry interval을 기준으로 시작합니다. 서버의 SSE `retry:` 필드가 이 interval을 바꿀 수 있습니다. `factor`는 지수 증가를 적용하고 `maxDelayMs`는 그 기준값을 제한합니다. 그 뒤 `jitter`가 0부터 설정값까지의 임의 millisecond를 더합니다. 상한을 적용한 뒤 jitter를 더하므로 최종 delay는 `maxDelayMs`를 `jitter` 미만만큼 넘을 수 있습니다.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

트랜스포트는 이후 시도에 최신 event ID를 `Last-Event-ID`로 보냅니다. `shouldReconnect`는 throw하지 않게 작성하세요. predicate가 throw하거나 reject하면 현재 모든 대기 iterator 또는 `stream.closed` 경로가 반드시 settle된다고 보장할 수 없습니다.

HTTP/open 검증 실패, 메시지 처리의 fatal 오류, 정상 EOF는 재시도 가능한 네트워크/read 실패와 다릅니다. 모든 최종 경로가 재연결된다고 가정하지 마세요.

## 공유 작업 큐

async iterable은 논리 스트림 하나의 공유 작업 큐입니다. 독립된 subscription이나 broadcast가 아니며 backpressure도 제공하지 않습니다.

기본 큐는 무제한입니다. `withSSEQueue(...)` 또는 `withSSEOptions({ queue })`로 제한하세요.

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | 제한에 도달했을 때의 동작                                     |
| ------------- | ------------------------------------------------------------- |
| `drop-newest` | 새로 들어온 이벤트를 버립니다.                                |
| `drop-oldest` | buffer의 가장 오래된 이벤트를 제거한 뒤 새 이벤트를 넣습니다. |
| `error`       | queue overflow 오류를 throw하고 처리를 종료합니다.            |

iterator가 여러 개면 각자 복사본을 받지 않고 값을 차지하려고 경쟁합니다. iterator에 생명주기를 처리하는 `return()` 구현이 없으므로 한 `for await` loop에서 `break`해도 트랜스포트가 닫히지 않습니다. `stream.close(...)`를 명시적으로 호출하세요.

close는 큐를 done 상태로 표시하지만 이미 buffer에 있는 값은 버리지 않습니다. consumer는 다음 iteration에서 `done: true`를 받기 전에 남은 값을 비울 수 있습니다.

### Parser buffer 제한

이벤트 큐와 parser buffer는 별개입니다. `withSSEOptions(...)`에서 양수 `maxBufferSize`를 설정해 끝나지 않은 SSE line에 보관하는 byte 수를 제한하세요.

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

시작 이후 이 제한을 넘으면 iterator가 reject되고 스트림은 `code: 'error'`로 닫힙니다. 생략하면 이 parser buffer는 무제한입니다.

## 최종 종료

`stream.closed`는 다음 값으로 resolve됩니다.

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof`는 응답 body가 정상적으로 끝났다는 뜻입니다.
- `aborted`에는 명시적인 `stream.close(...)` 또는 취소 경로가 포함됩니다.
- `error`는 재시도가 중단됐거나 최종 stream 오류가 발생했다는 뜻입니다.

`stream.close(reason)`은 idempotent합니다. 활성 트랜스포트 작업을 abort하고 새 push에 대해 큐를 닫으며 `stream.closed`를 settle합니다. `break`는 이 작업을 전혀 하지 않습니다.

스트림을 연 애플리케이션 경계가 종료도 소유합니다. 클라이언트나 framework 프로바이더가 자동으로 닫아 주지 않습니다.

## 다음 단계

- [WebSocket](/ko-KR/core/web-socket)에서는 양방향 세션과 명시적 재연결을 설명합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 SSE header 변경과 생명주기 관찰을 설명합니다.
- [오류](/ko-KR/core/errors)에서는 시작 응답의 가용성을 설명합니다.
