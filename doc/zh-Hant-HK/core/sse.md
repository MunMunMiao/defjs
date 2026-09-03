---
title: Server-Sent Events
description: Consume typed SSE stream，close 佢，再 await terminal closed promise。
---

# Server-Sent Events

開 stream、iterate 佢，再用 `await using` release 自己 own 嘅 handle。Manual `close()` 同 `closed` 仍然用得；clients 同 plugins 唔會代你 dispose return 出嚟嘅 stream。

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

## Define 條 stream

`defineEventStream(...)` 要 `events`、positive safe-integer `maxBufferSize`、positive safe-integer `maxQueueSize`，同 relative `path`。Method 預設 `GET`。

Request input 可以有 `path`、`query`、`headers` 同 `body`。Custom `build` 拎到同 HTTP 一樣嘅 request helpers，包括 body setters。你未 set `Accept` 時，Defjs 會送 `Accept: text/event-stream`。

一條 logical stream 可以跨幾個 physical Fetch attempts。即使冇 reconnect options，SSE 預設都會 retry transient network 同 stream-read failures；冇 `attempts` limit 就係 unbounded。你仍然淨係拎到一個 handle 同一個 async iterator。

## Open 同 inspect

`client.execute(...)` 淨係喺 status、content-type 同 body checks 通過之後先 resolve：

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

Response 一定要 successful，media type essence `text/event-stream`，同埋有 body。Non-2xx startup → `HTTP_STATUS`。Bad content type 或者 missing body → `RESPONSE_VALIDATION_FAILED`。Validation 喺 response 到咗之後先 fail 時，response snapshot 仍然可以坐喺 tuple 第三格。

`startupOpen` 係 initial snapshot。`stream.open` 係 live，之後嘅 physical opens 會變。第一次 response 重要時，keep 住 tuple value。

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## Decode events

Wire event name → `events[eventName]`；否則 `events.default`。冇 matching Struct → event 唔 deliver。Missing SSE `event` field → logical name `message`。

SSE `data` 一開始係 text。Selected Struct 決定 conversion：

| Struct                                                                 | Conversion                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()` | 維持 text                                                 |
| `struct.number()`                                                      | Trimmed text 一定要係 finite number；empty invalid        |
| `struct.boolean()`                                                     | Trimmed text 剛好 `true` 或者 `false`                     |
| `struct.json(inner)`                                                   | Parse JSON，再用 `inner` decode                           |
| Object、array、union、其他 ordinary Structs                            | 直接 decode text；睇落似 JSON 嘅 text **唔會** auto-parse |

Emitted value：`event`、decoded `data`、optional non-empty `id`。有 `default` 時，unknown event names 喺 inferred union 入面係 `string`。

## Observe invalid events

Invalid/undeclared events 會被 drop，唔會 queue。`withSSEOnInvalidEvent(...)` 可以 observe raw ID、name、text data，再加 `missing-struct` 或者 `validation-failed`，同 optional cause。

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

Observer 喺 transform boundary run。除非 active attempt signal aborted，否則佢嘅 failure 係 isolated。Keep 佢短；唔好將 raw event data 當 trusted。

## Reconnect

Reconnect settings 係 customize default retry path — 唔係一定要先 enable retries。Normal EOF 唔會 retry。Network 同 stream-read failures 可以 retry。Status/content-type validation、parser limits、message transform failures、queue overflow，同 normal EOF 對 logical stream 係 terminal。

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

`attempts` 數嘅係 initial attempt 之後嘅 retries；`attempts: 0` 關閉 retry。冇 attempt limit → unbounded built-in retries。`delayMs` 係 initial interval；`factor` 會長大佢；`maxDelayMs` cap base。SSE `jitter` 同 WebSocket 一樣，係 **0–1 multiplicative factor**。Stream `retry:` field 會 update 而家嘅 interval。Policy callback return false / throw / reject 會完結 logical stream。

Latest parsed event ID 會喺之後嘅 attempt 變成 `Last-Event-ID`。Unbounded reconnect 之前，先搞清楚 server 嘅 replay semantics。

## Buffer 同 queue limits

兩個都一定要係 positive safe integers。Overflow 係 fatal — 唔會 silent discard 舊 events。

| Limit           | Protects                                       | Terminal code           |
| --------------- | ---------------------------------------------- | ----------------------- |
| `maxBufferSize` | Parsing 時 incomplete/oversized SSE line/event | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | Events 產出快過唯一個 consumer 讀              | `QUEUE_OVERFLOW`        |

Fatal stream 亦會清 buffered events、cancel active body、reject iterator，再用 `code: 'error'` resolve `stream.closed`。

## Close 同 dispose

`EventStreamHandle`：一個 live opening snapshot、一個 terminal promise、一個 `close`、一個 async iterator，同一個 standard async disposer。

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

Terminal codes：`eof`、`aborted` 或者 `error`。`error` result 亦會帶 `EventStreamErrorCode`：`INVALID_RESPONSE`、`MESSAGE_PROCESSING_FAILED`、`PARSER_LIMIT_EXCEEDED`、`QUEUE_OVERFLOW`、`TIMEOUT` 或者 `TRANSPORT_ERROR`。

`close(reason)` 會 abort active attempt、close queue、settle 成 `aborted`。Loop `break` / `return` / throw 會 invoke iterator return，再用 `iterator-return` close。Execute command 嘅 code own closure。

`await using` 會 call 同一條 owned close path，再等 Defjs 嘅 read/reconnect work 停低，同 active reader lock release。假如 provider-controlled `ReadableStream.cancel()` promise 永久卡住，佢唔保證嗰個 promise 完成。要 reason 或 terminal result 時，仍然可以 explicit `stream.close(reason)`，再 `await stream.closed`。

自己 structural implement `EventStreamHandle` 嘅 code，而家必須 provide `[Symbol.asyncDispose](): PromiseLike<void>`，再接去同一個 lifecycle。對 implementer 嚟講係 compile-time breaking change；淨係接收 Defjs handle 嘅 consumer 唔使加新 runtime call。

Repository 驗證同 support 嘅最低 lib contract，係固定 TypeScript 7 加 `ES2022`、`ESNext.Disposable`、`DOM`、`DOM.Iterable`。呢四項組合先係一個 baseline；唔代表每份 declaration 都各自強制晒四項，亦唔承諾未測試過嘅舊 compiler。普通 HTTP Client 唔係 `AsyncDisposable`，request 要用 timeout 或 `AbortSignal` manage。

Keep credentials、event data、event IDs、causes 同 stream URLs 出日常 logs。`withCredentials(true)` 影響 SSE 嘅 Fetch cookies；佢唔會 configure WebSocket auth。

## Related recipes

- [Consume an SSE stream](../recipes/consume-sse.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)
