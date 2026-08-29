---
title: SSE
description: defineEventStream、execute options，以及 stream handle。
---

# SSE

声明一条事件流，execute，迭代事件，再 close。

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`、`events` map，可选 `method`（默认 `'GET'`）、`input`、`build`、buffer/queue 上限。
- **返回** 一个 builder。塞 input 调用，得到 `EventStreamCommand`。

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

`client.execute` 的底层入口。业务代码走 client。

- **返回** `[null, stream, open]` 或 `[error, undefined, open?]`。

## 执行 options

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

取消规则和 HTTP 一样：`abort` 或 `timeout`，别两个一起。

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` 是启动快照；重连后可能变——也读 `stream.open`。自有作用域优先用 `await using stream = handle` 清理。disposer 会停止 Defjs 的读取和重连任务，并等待 reader lock 释放；它不承诺由 provider 控制且卡住的 `ReadableStream.cancel()` promise 一定完成。手动 `close()` / `closed` 仍可使用。

```ts
async function consume(handle: EventStreamHandle<unknown>): Promise<void> {
  await using stream = handle
  for await (const event of stream) console.log(event)
}
```

结构化实现 `EventStreamHandle` 的代码现在必须实现 `[Symbol.asyncDispose]()`，并返回同一条自有 teardown 路径。对自定义 handle 实现者而言，这是编译期 breaking change；只接收 Defjs 返回 handle 的代码无需新增运行时调用。

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

见 [SSE 指南](../core/sse.md) 和[消费 SSE 流](../recipes/consume-sse.md)。

## EventStreamDefinition {#EventStreamDefinition}

`path`、`events`，可选 `method` / `input` / `build`，还有 buffer 和 queue 上限。

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

`defineEventStream` 的返回值。拿 input 调一下就得到 `EventStreamCommand`。

## EventStreamCommand {#EventStreamCommand}

不透明的 SSE command。丢给 `client.execute`。

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

从 `EventStructs` map 推出来的解析后事件载荷。
