---
title: Server-Sent Events
description: 消費型別化的 SSE 串流，關閉它，並 await 終端的 closed promise。
---

# Server-Sent Events

開啟串流、迭代它，再用 `await using` 釋放自有 handle。手動 `close()` 與 `closed` 仍可使用；clients 與 plugins 不會替你 dispose 回傳的串流。

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

## 定義串流

`defineEventStream(...)` 需要 `events`、正的 safe-integer `maxBufferSize`、正的 safe-integer `maxQueueSize`，以及相對 `path`。Method 預設是 `GET`。

Request input 可以有 `path`、`query`、`headers` — 沒有 `body`。自訂 `build` 只拿到 path／query／header setters。你沒設 `Accept` 時，Defjs 會送 `Accept: text/event-stream`。

一個邏輯串流可以跨多次實體 Fetch attempts。即使沒設 reconnect options，SSE 預設仍會重試暫時性的網路與串流讀取失敗；沒有 `attempts` 上限時，那些重試是無界的。你仍只拿到一個 handle 與一個 async iterator。

## 開啟與檢查

`client.execute(...)` 只有在 status、content-type、body 檢查通過後才會 resolve：

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

回應必須成功、media type essence 是 `text/event-stream`，且有 body。非 2xx 啟動 → `HTTP_STATUS`。壞 content type 或缺少 body → `RESPONSE_VALIDATION_FAILED`。回應抵達後驗證失敗時，第三格 tuple 仍可能放著回應快照。

`startupOpen` 是初始快照。`stream.open` 是 live 的，之後的實體 opens 會變。第一個回應重要時，留住 tuple 那個值。

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## 解碼事件

Wire event name → `events[eventName]`；否則 `events.default`。沒有相符 Struct → 事件不會交付。缺少 SSE `event` 欄位 → 邏輯名稱 `message`。

SSE `data` 一開始是文字。選定的 Struct 決定轉換：

| Struct                                                                 | 轉換                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `struct.string()`、`struct.text()`、`struct.any()`、`struct.unknown()` | 維持文字                                             |
| `struct.number()`                                                      | Trimmed 文字必須是 finite number；空的無效           |
| `struct.boolean()`                                                     | Trimmed 文字正好是 `true` 或 `false`                 |
| `struct.json(inner)`                                                   | Parse JSON，再用 `inner` 解碼                        |
| Object、array、union、其他一般 Structs                                 | 直接解碼文字；看起來像 JSON 的文字**不會**自動 parse |

發出的值：`event`、解碼後的 `data`、選填的非空 `id`。有 `default` 時，未知 event names 在推導的 union 裡是 `string`。

## 觀察無效事件

無效／未宣告事件會被丟掉，不會進 queue。`withSSEOnInvalidEvent(...)` 可觀察 raw ID、名稱、文字 data，以及 `missing-struct` 或 `validation-failed` 與選填 cause。

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

Observer 跑在 transform 邊界。除非 active attempt signal 已 aborted，否則它的失敗是隔離的。保持短小；別把 raw event data 當可信資料。

## 重連

Reconnect 設定是自訂預設重試路徑 — 不是開啟重試的必要條件。正常 EOF 不會重試。網路與串流讀取失敗可以重試。Status／content-type 驗證、parser 限制、message transform 失敗、queue overflow、正常 EOF，對邏輯串流都是終端。

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

`attempts` 計算初始 attempt 之後的重試；`attempts: 0` 關掉重試。沒有 attempt 上限 → 內建重試無界。`delayMs` 是起始間隔；`factor` 放大它；`maxDelayMs` 限制基數。SSE 的 `jitter` 是與 WebSocket 相同的 **0–1 乘性因子**。串流的 `retry:` 欄位會更新目前間隔。政策 callback 回傳 false／throw／reject 會結束邏輯串流。

最新剖析到的 event ID 會在之後的 attempt 變成 `Last-Event-ID`。無界重連前，先搞清楚伺服器的 replay 語意。

## Buffer 與 queue 限制

兩者都必須是正的 safe integers。Overflow 是致命的 — 不會默默丟掉較舊事件。

| 限制            | 保護什麼                             | 終端 code               |
| --------------- | ------------------------------------ | ----------------------- |
| `maxBufferSize` | 剖析時不完整／過大的 SSE line／event | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | 事件產出快過單一消費者讀取           | `QUEUE_OVERFLOW`        |

致命串流也會清掉 buffered events、取消 active body、reject iterator，並以 `code: 'error'` resolve `stream.closed`。

## Close 與 dispose

`EventStreamHandle`：一個 live opening 快照、一個終端 promise、一個 `close`、一個 async iterator，以及一個標準 async disposer。

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

終端 codes：`eof`、`aborted` 或 `error`。`error` 結果還帶 `EventStreamErrorCode`：`INVALID_RESPONSE`、`MESSAGE_PROCESSING_FAILED`、`PARSER_LIMIT_EXCEEDED`、`QUEUE_OVERFLOW`、`TIMEOUT` 或 `TRANSPORT_ERROR`。

`close(reason)` 會 abort active attempt、關閉 queue、以 `aborted` settle。迴圈 `break`／`return`／throw 會觸發 iterator return，並以 `iterator-return` 關閉。執行 command 的程式碼擁有關閉責任。

`await using` 會呼叫同一條自有 close 路徑，並等待 Defjs 讀取／重連工作停止，以及 active reader lock 釋放。如果 provider-controlled `ReadableStream.cancel()` promise 永久卡住，它不保證該 promise 完成。需要 reason 或終端結果時，仍可明確呼叫 `stream.close(reason)`，再 `await stream.closed`。

結構化實作 `EventStreamHandle` 的程式碼現在必須提供 `[Symbol.asyncDispose](): PromiseLike<void>`，並接到同一個 lifecycle。對實作者而言，這是編譯期 breaking change；只接收 Defjs handle 的 consumer 不必新增執行期呼叫。

儲存庫已驗證並支援的最低 lib 契約，是固定 TypeScript 7 加上 `ES2022`、`ESNext.Disposable`、`DOM`、`DOM.Iterable`。這四項組合是一個 baseline；不表示每份 declaration 都各自強制全部四項，也不承諾未經測試的舊 compiler。一般 HTTP Client 不是 `AsyncDisposable`，其請求應使用 timeout 或 `AbortSignal` 管理。

Credentials、event data、event IDs、causes、stream URLs 別進日常 logs。`withCredentials(true)` 影響 SSE 的 Fetch cookies；它不會設定 WebSocket auth。

## 相關 recipes

- [消費 SSE 串流](../recipes/consume-sse.md)
- [取消 HTTP 呼叫](../recipes/cancel-http.md)
