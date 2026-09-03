---
title: Server-Sent Events
description: 타입이 잡힌 SSE 스트림을 소비하고, 닫고, 종료 closed 프로미스를 await 해요.
---

# Server-Sent Events

스트림을 열고 순회한 뒤, 소유한 핸들을 `await using`으로 해제하세요. 수동 `close()`와 `closed`도 그대로 쓸 수 있고, 클라이언트와 플러그인이 반환된 스트림을 대신 dispose하지 않아요.

## Basic Setup

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, stream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using ownedStream = stream
  for await (const event of ownedStream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## 스트림 정의하기

`defineEventStream(...)`에는 `events`, 양의 안전 정수 `maxBufferSize`, 양의 안전 정수 `maxQueueSize`, 상대 `path`가 필요해요. 메서드 기본값은 `GET`이에요.

요청 입력에는 `path`, `query`, `headers`, `body`가 있을 수 있어요. 커스텀 `build`는 HTTP와 같은 request helper(body setter 포함)를 받아요. `Accept`를 이미 설정하지 않았다면 Defjs가 `Accept: text/event-stream`을 보내요.

하나의 논리 스트림은 여러 물리 Fetch 시도를 걸칠 수 있어요. SSE는 재연결 옵션 없이도 일시적 네트워크·스트림 읽기 실패를 기본 재시도해요. `attempts` 한도가 없으면 그 재시도는 무제한이에요. 그래도 핸들과 async iterator는 하나예요.

## 열고 살펴보기

`client.execute(...)`는 status, content-type, body 검사가 통과한 뒤에만 resolve해요.

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

응답은 성공이어야 하고, media type essence가 `text/event-stream`이어야 하며 body가 있어야 해요. non-2xx 시작 → `HTTP_STATUS`. 잘못된 content type이나 없는 body → `RESPONSE_VALIDATION_FAILED`. 응답이 도착한 뒤 검증이 실패해도 응답 스냅샷이 튜플 세 번째에 남을 수 있어요.

`startupOpen`은 초기 스냅샷이에요. `stream.open`은 live이고 이후 물리 open에서 바뀌어요. 첫 응답이 중요하면 튜플 값을 유지하세요.

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## 이벤트 디코딩하기

와이어 이벤트 이름 → `events[eventName]`; 없으면 `events.default`. 맞는 Struct가 없으면 이벤트를 전달하지 않아요. SSE `event` 필드가 없으면 논리 이름은 `message`예요.

SSE `data`는 텍스트로 시작해요. 선택된 Struct가 변환을 정해요.

| Struct                                                                 | Conversion                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()` | 텍스트로 유지                                                  |
| `struct.number()`                                                      | trim한 텍스트가 유한 숫자여야 해요; 빈 값은 무효               |
| `struct.boolean()`                                                     | trim한 텍스트가 정확히 `true` 또는 `false`                     |
| `struct.json(inner)`                                                   | JSON 파싱 후 `inner`로 디코딩                                  |
| object, array, union, 기타 일반 Struct                                 | 텍스트를 직접 디코딩; JSON처럼 보여도 **자동 파싱하지 않아요** |

방출 값: `event`, 디코딩된 `data`, 선택적 비어 있지 않은 `id`. `default`가 있으면 알 수 없는 이벤트 이름은 추론 유니온에서 `string`이에요.

## 잘못된 이벤트 관찰하기

잘못되거나 미선언된 이벤트는 큐에 넣지 않고 버려요. `withSSEOnInvalidEvent(...)`는 원본 ID, 이름, 텍스트 data와 `missing-struct` 또는 `validation-failed`, 선택적 cause를 관찰할 수 있어요.

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

옵저버는 transform 경계에서 돌아요. 활성 시도 signal이 abort되지 않는 한 실패는 격리돼요. 짧게 유지하고, 원본 이벤트 data를 신뢰하지 마세요.

## 재연결

재연결 설정은 기본 재시도 경로를 맞춤 설정해요 — 재시도를 켜는 데 필수는 아니에요. 정상 EOF는 재시도하지 않아요. 네트워크와 스트림 읽기 실패는 재시도할 수 있어요. status/content-type 검증, 파서 한도, 메시지 transform 실패, 큐 오버플로, 정상 EOF는 논리 스트림에 종료예요.

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts`는 최초 시도 이후 재시도 횟수예요. `attempts: 0`은 재시도를 꺼요. 시도 한도가 없으면 내장 재시도가 무제한이에요. `delayMs`는 초기 간격이고, `factor`가 키우고, `maxDelayMs`가 기본값을 상한해요. SSE `jitter`는 WebSocket과 같은 **0–1 곱셈 인자**예요. 스트림 `retry:` 필드는 현재 간격을 갱신해요. 정책 콜백이 false를 반환하거나 throw/reject하면 논리 스트림이 끝나요.

가장 최근에 파싱된 이벤트 ID는 이후 시도의 `Last-Event-ID`가 돼요. 무제한 재연결 전에 서버의 재생 의미를 알아 두세요.

## 버퍼와 큐 한도

둘 다 양의 안전 정수여야 해요. 오버플로는 치명적이에요 — 오래된 이벤트를 조용히 버리지 않아요.

| Limit           | Protects                             | Terminal code           |
| --------------- | ------------------------------------ | ----------------------- |
| `maxBufferSize` | 파싱 중 불완전/과대 SSE 줄/이벤트    | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | 소비자 하나보다 빠르게 생산된 이벤트 | `QUEUE_OVERFLOW`        |

치명적 스트림은 버퍼된 이벤트도 비우고, 활성 body를 취소하고, iterator를 reject하고, `stream.closed`를 `code: 'error'`로 resolve해요.

## 닫고 dispose하기

`EventStreamHandle`: live opening 스냅샷 하나, 종료 프로미스 하나, `close` 하나, async iterator 하나, 표준 async disposer 하나예요.

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

interface StreamApi<T> extends AsyncIterable<T>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

종료 코드: `eof`, `aborted`, 또는 `error`. `error` 결과에는 `EventStreamErrorCode`도 있어요. `INVALID_RESPONSE`, `MESSAGE_PROCESSING_FAILED`, `PARSER_LIMIT_EXCEEDED`, `QUEUE_OVERFLOW`, `TIMEOUT`, 또는 `TRANSPORT_ERROR`예요.

`close(reason)`은 활성 시도를 abort하고, 큐를 닫고, `aborted`로 settle해요. 루프 `break` / `return` / throw는 iterator return을 호출하고 `iterator-return`으로 닫아요. 명령을 실행한 코드가 닫기를 소유해요.

`await using`은 같은 소유 close 경로를 호출하고 Defjs의 읽기/재연결 작업이 멈추고 활성 reader lock이 해제될 때까지 기다려요. Provider가 제어하는 `ReadableStream.cancel()` 프로미스가 끝없이 멈춘 경우까지 완료를 보장하지는 않아요. 이유나 종료 결과가 필요하면 명시적으로 `stream.close(reason)`한 뒤 `await stream.closed` 해도 돼요.

구조적으로 `EventStreamHandle`을 직접 구현한 코드는 이제 `[Symbol.asyncDispose](): PromiseLike<void>`를 같은 lifecycle에 연결해야 해요. 구현자에게는 컴파일 타임 breaking change지만, Defjs 핸들을 받기만 하는 소비자는 런타임에 새 메서드를 호출할 필요가 없어요.

저장소에서 검증하고 지원하는 최소 lib 계약은 고정된 TypeScript 7과 `ES2022`, `ESNext.Disposable`, `DOM`, `DOM.Iterable`이에요. 이 네 항목의 조합이 하나의 baseline이고, 각 declaration이 네 항목을 각각 독립적으로 모두 강제한다는 뜻은 아니에요. 테스트하지 않은 이전 compiler도 보장하지 않아요. 일반 HTTP Client는 `AsyncDisposable`이 아니며, timeout이나 `AbortSignal`로 요청을 관리해요.

자격 증명, 이벤트 data, 이벤트 ID, cause, 스트림 URL은 일상 로그에 넣지 마세요. `withCredentials(true)`는 SSE용 Fetch 쿠키에 영향을 주고, WebSocket 인증을 설정하지는 않아요.

## 관련 레시피

- [SSE 스트림 소비하기](../recipes/consume-sse.md)
- [HTTP 호출 취소하기](../recipes/cancel-http.md)
