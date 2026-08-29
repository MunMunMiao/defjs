---
title: SSE
description: defineEventStream、execute options、stream handle です。
---

# SSE

イベントストリームを宣言し、実行し、イベントを反復してから閉じます。

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`、`events` マップ、任意の `method`（デフォルト `'GET'`）、`input`、`build`、バッファ/キュー上限です。
- **戻り値** — ビルダーです。入力を渡すと `EventStreamCommand` になります。

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

`client.execute` の低レベル入口です。アプリコードではクライアントを使ってください。

- **戻り値** — `[null, stream, open]`、または `[error, undefined, open?]` です。

## 実行 options

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

キャンセル規則は HTTP と同じです。`abort` か `timeout` の一方だけで、両方は使えません。

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` は起動時スナップショットです。再接続後は変わり得るので、`stream.open` も読んでください。所有する cleanup には `await using` を使えます。手動制御向けの `close()` と `closed` も残っています。

disposer は Defjs の読み取り/再接続ループの停止と reader lock の解放を待ちます。provider 側で止まった `ReadableStream.cancel()` Promise の完了は保証しません。構造的な独自 `EventStreamHandle` 実装には同じ `[Symbol.asyncDispose]()` が必要で、これはコンパイル時の breaking change です。

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

`EventStreamErrorCode` は `'INVALID_RESPONSE' | 'MESSAGE_PROCESSING_FAILED' | 'PARSER_LIMIT_EXCEEDED' | 'QUEUE_OVERFLOW' | 'TIMEOUT' | 'TRANSPORT_ERROR'` です。

## イベント map

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

[SSE ガイド](../core/sse.md) と [SSE ストリームを消費する](../recipes/consume-sse.md) を見てください。

## EventStreamDefinition {#EventStreamDefinition}

`path`、`events`、任意の `method` / `input` / `build`、バッファとキューの上限です。

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

`defineEventStream` の戻り値です。input を渡して呼ぶと `EventStreamCommand` になります。

## EventStreamCommand {#EventStreamCommand}

不透明な SSE command です。`client.execute` に渡します。

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

`EventStructs` の map から推論した、パース済みイベントペイロードです。
