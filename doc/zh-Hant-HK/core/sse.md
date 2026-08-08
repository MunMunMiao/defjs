---
title: SSE
description: 定義及解碼 Server-Sent Events、處理 startup、讀取共用 event queue、設定 reconnect，並關閉自己擁有的 stream。
---

# SSE

`defineEventStream(...)` 建立 SSE command builder。Endpoint 會宣告 path，以及各 event name 對應的 Struct。

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

Method 預設為 `GET`。Endpoint 可以指定其他 method，但 high-level SSE build context 不支援 request body。

## Event 解碼

SSE parser 先選取 `events[eventName]`，沒有精確 match 才使用 `events.default`。兩者都不匹配時，event 會被丟棄，可選的 invalid-event observer 會收到 `missing-struct`。

SSE `data:` 以 text 傳入：

- `struct.string()`、`struct.text()`、`struct.any()` 與 `struct.unknown()` 接收 text；
- `struct.number()` 會 trim text，並只接受 finite number；
- `struct.boolean()` 會 trim text，並只接受 `true` 或 `false`；
- `struct.json(inner)` 先 parse JSON text，再用 `inner` 作結構式解碼。

單獨的 `struct.object(...)` 不會 parse 看似 JSON 的 event text，必須用 `struct.json(...)` 包裹。

`default` Struct 處理其他未宣告名稱：

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

沒有 `default` Struct 時，`EventStreamData<TEvents>` 是由已宣告 event name 組成的 discriminated union。對 `event.event` 作 switch 會將 `event.data` narrow 至對應的 Struct output。當有 `default` 時，其 branch 會以 `event: string` 保留 wire 上的實際 event name；因此，混合已知 event 與 `default` 的 stream 仍會保留這個寬泛 fallback branch。

## Input 與 Request Mapping

Path、query 與 header section 使用 `struct.request(...)`：

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

自訂 SSE `build` 可以設定 path parameter、query parameter 與 header。它接收 schema-bound projection，不能設定 body 或 credentials。Credentials 要在 client 透過 `withCredentials(...)` 設定。

## Startup Tuple

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

SSE 回傳：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

成功時，第三項是已驗證的 startup-open snapshot；當中的 response 已通過 HTTP status 與 `text/event-stream` content-type check。

`stream.open` 是 live getter，保存 logical stream 最近一次看到的 response，包括之後 reconnect 時最終未通過 status 或 content-type validation 的 response。需要初始 snapshot 時，請另行保存 `startupOpen`。

預設不要記錄 `startupOpen.url`、`stream.open.url` 或 response URL，因為可能包含敏感 path 或 query data。

## 讀取 Event

擁有者應在同一 lifecycle 內開始 iteration，並安排 close：

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

`execute` 成功只代表 startup 完成。Startup 後的 error 會透過 iterator rejection 與 `stream.closed` 出現，不會回頭修改原始 tuple 的 `error` item。

## 無效 Event

用 `withSSEOnInvalidEvent(...)` 或 `withSSEOptions(...)` 設定 `onInvalidEvent`：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

Observer 會收到：

- `reason: 'missing-struct' | 'validation-failed'`；
- 原始 event 的 `id`、name、data text 與可選 retry value；
- validation failure 的 `cause`。

該 event 會被丟棄，之後的 valid event 仍可正常送達。Observer throw 與 rejected promise 會被捕捉，但 async observer 會先被 await，才繼續處理下一個 message。請保持工作量小。記錄原始 `id`、`data` 或 `cause` 前，必須先審查並 redact。

## 重連

SSE 內置 network error 與 stream-read failure retry。正常 EOF 會以 `code: 'eof'` 關閉 stream，不會 reconnect。

預設由 1 秒開始 retry，而且沒有次數上限。設定 `attempts` 才會限制次數：

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

`attempts` 是首次 attempt 之後的 retry 次數。`attempts: 0` 會停用 retry。傳給 `shouldReconnect` 的 `attempt` 由第一次 retry 的 1 開始，並在整個 logical stream 持續累計；成功建立實體連線亦不會 reset。

Delay 由目前 retry interval 開始。Server 可用 SSE `retry:` 欄位更新 interval。`factor` 套用 exponential growth，`maxDelayMs` 限制 base delay；`jitter` 最後再加上 0 至設定值之間的隨機毫秒數。由於 jitter 在 cap 後才加，final delay 可以超過 `maxDelayMs`，但超出部分會小於 `jitter`。

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

Transport 會在之後的 attempt 以 `Last-Event-ID` 傳送最新 event ID。`shouldReconnect` 必須保持不拋錯；predicate throw 或 reject 時，目前不能保證每個 pending iterator 或 `stream.closed` path 都會 settle。

HTTP/open validation failure、message-processing fatal error 與 normal EOF，都不是可 retry 的 network/read failure。不要假設每條 terminal path 都會 reconnect。

## 共用工作隊列

Async iterable 是 logical stream 上唯一的共用工作隊列（shared work queue），並非 subscription、broadcast 或 backpressure mechanism。

Queue 預設無上限。用 `withSSEQueue(...)` 或 `withSSEOptions({ queue })` 設定 bound：

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | 達到上限時的行為                                 |
| ------------- | ------------------------------------------------ |
| `drop-newest` | 丟棄剛到達的 event。                             |
| `drop-oldest` | 移除最舊的 buffered event，再 enqueue 新 event。 |
| `error`       | 拋出 queue overflow error 並終止處理。           |

多個 iterator 會競爭值，不會各自收到副本。離開某個 `for await` loop 不會關閉 transport，因為 iterator 沒有 lifecycle-aware `return()` implementation；必須明確呼叫 `stream.close(...)`。

Close 只會把 queue 標記為 done，不會丟棄已 buffered 的值。Consumer 可以先 drain 這些值，下一次 iteration 才得到 `done: true`。

### Parser Buffer 上限

Event queue 與 parser buffer 是兩回事。透過 `withSSEOptions(...)` 設定正數 `maxBufferSize`，可限制 incomplete SSE line 所佔的 byte：

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

Startup 後超出上限會 reject iterator，並以 `code: 'error'` 關閉 stream。省略時，parser buffer 不設上限。

## Terminal Close

`stream.closed` resolve 成：

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` 代表 response body 正常完結；
- `aborted` 包括明確 `stream.close(...)` 或 cancellation path；
- `error` 代表 retry 已停止，或出現 terminal stream error。

`stream.close(reason)` 是 idempotent。它會 abort active transport 工作、禁止再向 queue push，並 settle `stream.closed`。單純 `break` 不會做這些事。

開啟 stream 的應用程式邊界負責關閉。Client 或 framework provider 不會自動處理。

## 下一步

- [WebSocket](/zh-Hant-HK/core/web-socket)：bidirectional session 與 opt-in reconnect。
- [Interceptors](/zh-Hant-HK/core/interceptors)：SSE header modification 與 lifecycle observation。
- [Errors](/zh-Hant-HK/core/errors)：startup response availability。
