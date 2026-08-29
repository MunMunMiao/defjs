---
title: SSE
description: defineEventStream、execute options，以及 stream handle。
---

# SSE

宣告事件串流、執行、迭代 events，然後 close。

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`、`events` map、選填 `method`（預設 `'GET'`）、`input`、`build`、buffer／queue 限制。
- **回傳** builder。帶 input 呼叫就得到 `EventStreamCommand`。

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

`client.execute` 走的低階入口。寫功能時請走 client。

- **回傳** `[null, stream, open]` 或 `[error, undefined, open?]`。

## 執行 options

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

取消規則跟 HTTP 一樣：`abort` 或 `timeout`，不能兩個一起。

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` 是啟動快照；重連後可能變 — 也讀 `stream.open`。自有作用域優先用 `await using stream = handle` 清理。Disposer 會停止 Defjs 的讀取與重連工作，並等待 reader lock 釋放；它不承諾由 provider 控制且卡住的 `ReadableStream.cancel()` promise 一定完成。手動 `close()` / `closed` 仍可使用。

```ts
async function consume(handle: EventStreamHandle<unknown>): Promise<void> {
  await using stream = handle
  for await (const event of stream) console.log(event)
}
```

結構化實作 `EventStreamHandle` 的程式碼現在必須實作 `[Symbol.asyncDispose]()`，並回傳同一條自有 teardown 路徑。對自訂 handle 實作者而言，這是編譯期 breaking change；只接收 Defjs 回傳 handle 的程式碼不必新增執行期呼叫。

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

`EventStreamErrorCode`：`'INVALID_RESPONSE' | 'MESSAGE_PROCESSING_FAILED' | 'PARSER_LIMIT_EXCEEDED' | 'QUEUE_OVERFLOW' | 'TIMEOUT' | 'TRANSPORT_ERROR'`。

## 事件 map

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

見 [SSE 指南](../core/sse.md) 與 [消費 SSE 串流](../recipes/consume-sse.md)。

## EventStreamDefinition {#EventStreamDefinition}

`path`、`events`，可選 `method`／`input`／`build`，還有 buffer 與 queue 上限。

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

`defineEventStream` 的回傳值。拿 input 呼叫就得到 `EventStreamCommand`。

## EventStreamCommand {#EventStreamCommand}

不透明的 SSE command。丟給 `client.execute`。

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

從 `EventStructs` map 推出的解析後事件載荷。
