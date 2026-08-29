---
title: SSE
description: defineEventStream, 실행 옵션, 스트림 핸들이에요.
---

# SSE

이벤트 스트림을 선언하고, 실행하고, 이벤트를 순회한 뒤 닫아요.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`, `events` 맵, 선택 `method` (기본 `'GET'`), `input`, `build`, buffer/queue 한도예요.
- **Returns** 빌더예요. 입력을 넣으면 `EventStreamCommand`가 나와요.

```ts
import { defineEventStream, struct } from '@defjs/core'

const ticks = defineEventStream({
  path: '/ticks',
  events: { message: struct.object({ text: struct.string() }) },
})
```

## executeEventStreamCommand() {#executeEventStreamCommand}

```ts
function executeEventStreamCommand(
  clientConfig: ClientConfig,
  command: EventStreamCommand,
  options?: EventStreamExecuteOptions,
): Promise<StreamAwaitResult>
```

`client.execute`의 저수준 진입점이에요. 앱 코드에서는 클라이언트를 쓰세요.

- **Returns** `[null, stream, open]` 또는 `[error, undefined, open?]`예요.

## 실행 options

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

HTTP와 같은 취소 규칙이에요. `abort` 또는 `timeout`이지, 둘 다는 아니에요.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open`은 시작 스냅샷이에요. 재연결 후 바뀔 수 있어요 — `stream.open`도 읽어요. 소유한 범위는 `await using stream = handle`로 정리하세요. disposer는 Defjs의 읽기와 재연결 작업을 멈추고 reader lock이 해제될 때까지 기다리지만, provider가 제어하고 멈춰 버린 `ReadableStream.cancel()` 프로미스의 완료까지 보장하지는 않아요. 수동 `close()` / `closed`도 그대로 쓸 수 있어요.

```ts
async function consume(handle: EventStreamHandle<unknown>): Promise<void> {
  await using stream = handle
  for await (const event of stream) console.log(event)
}
```

`EventStreamHandle`을 구조적으로 직접 구현한 코드는 이제 `[Symbol.asyncDispose]()`도 구현해 같은 소유 teardown 경로를 반환해야 해요. 커스텀 핸들 구현자에게는 컴파일 타임 breaking change지만, Defjs가 반환한 핸들을 받기만 하는 코드는 런타임에 새 호출을 추가할 필요가 없어요.

### EventStreamOpenInfo {#EventStreamOpenInfo}

```ts
interface EventStreamOpenInfo {
  response: HttpResponse<unknown>
  url: string
}
```

### EventStreamCloseInfo {#EventStreamCloseInfo}

```ts
type EventStreamCloseInfo =
  | { code: 'eof' | 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

`EventStreamErrorCode`: `'INVALID_RESPONSE' | 'MESSAGE_PROCESSING_FAILED' | 'PARSER_LIMIT_EXCEEDED' | 'QUEUE_OVERFLOW' | 'TIMEOUT' | 'TRANSPORT_ERROR'`.

## 이벤트 map

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

자세한 내용은 [SSE 가이드](../core/sse.md)와 [SSE 스트림 소비하기](../recipes/consume-sse.md)를 보세요.

## EventStreamDefinition {#EventStreamDefinition}

`path`, `events`, 선택 `method` / `input` / `build`, 버퍼와 큐 한도예요.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

`defineEventStream`가 돌려주는 값이에요. input을 넣어 호출하면 `EventStreamCommand`가 나와요.

## EventStreamCommand {#EventStreamCommand}

불투명 SSE command예요. `client.execute`에 넣어요.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

`EventStructs` map에서 추론한, 파싱된 이벤트 payload예요.
