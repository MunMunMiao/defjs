---
title: SSE
description: 定義並解碼 Server-Sent Events、處理啟動、消費共用事件佇列、設定重連，並關閉自己擁有的 stream。
---

# SSE

`defineEventStream(...)` 會建立 SSE 指令建構器。端點會宣告 path，以及每個 event name 要使用的 Struct。

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

Method 預設是 `GET`。端點可以指定其他 method，但 high-level SSE build context 不支援 request body。

## 事件解碼

SSE parser 會先選 `events[eventName]`，沒有時再選 `events.default`。兩者都找不到就丟棄事件，並向選用的 invalid-event observer 回報 `missing-struct`。

SSE `data:` 以文字抵達：

- `struct.string()`、`struct.text()`、`struct.any()` 與 `struct.unknown()` 會收到文字；
- `struct.number()` 會 trim 文字並接受 finite number；
- `struct.boolean()` 會 trim 文字，而且只接受 `true` 或 `false`；
- `struct.json(inner)` 先解析 JSON 文字，再用 `inner` 做結構解碼。

單獨的 `struct.object(...)` 不會解析看起來像 JSON 的 event text，必須用 `struct.json(...)` 包起來。

`default` Struct 會處理其他未宣告名稱：

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

沒有 `default` Struct 時，`EventStreamData<TEvents>` 是由已宣告事件名稱組成的判別聯集。對 `event.event` 使用 switch 會將 `event.data` narrow 為對應的 Struct 輸出。當 `default` 存在時，其分支會以 `event: string` 保留 wire 上的實際事件名稱；因此，混合已知事件與 `default` 的 stream 仍會保留這個寬廣的 fallback 分支。

## 輸入與 Request Mapping

Path、query 與 header section 請使用 `struct.request(...)`：

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

自訂 SSE `build` 可以設定 path parameter、query parameter 與 header。它收到結構描述綁定投影，不能設定 body 或 credentials。Credentials 請在 client 上用 `withCredentials(...)` 設定。

## 啟動 Tuple

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

成功時，第三個元素是驗證過的啟動開啟快照。它的 response 已通過 HTTP status 與 `text/event-stream` content-type 檢查。

`stream.open` 是即時 getter，保存邏輯 stream 最新看到的 response。即使後續重連 response 沒通過 status 或 content-type 驗證，也會出現在這裡。初始快照很重要時，請另外保留 `startupOpen`。

預設不要記錄 `startupOpen.url`、`stream.open.url` 或 response URL，其中可能含有敏感的 path 或 query data。

## 消費事件

擁有者應在同一個生命週期內開始迭代，並安排關閉：

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

`execute` 成功代表啟動完成。啟動後發生的錯誤會透過 iterator rejection 與 `stream.closed` 出現，不會回頭改變原始 tuple 的 `error` 項目。

## 無效事件

透過 `withSSEOnInvalidEvent(...)` 或 `withSSEOptions(...)` 設定 `onInvalidEvent`：

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
- 原始事件的 `id`、name、data text 與選用 retry value；
- validation failure 的 `cause`。

這個事件會被丟棄，後續有效事件仍可正常送出。Observer throw 與 rejected promise 會被接住，但 async observer 會先 await 才繼續處理後續訊息，所以要保持快速。記錄原始 `id`、`data` 與 `cause` 前，務必審查並遮罩。

## 重連

SSE 對網路與 stream read failure 內建重試行為。正常 EOF 會以 `code: 'eof'` 關閉 stream，不會重連。

預設從 1 秒開始重試，而且沒有次數上限。用 `attempts` 設定上限：

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

`attempts` 指初次嘗試之後的重試次數。`attempts: 0` 會停用重試。傳給 `shouldReconnect` 的 `attempt` 在第一次重試時從 1 開始，並在同一個邏輯 stream 內持續累加；實體連線成功不會把它重設。

Delay 從目前的 retry interval 開始。伺服器可以用 SSE `retry:` 欄位更新 interval。`factor` 套用指數成長，`maxDelayMs` 則限制 base 上限。`jitter` 會再加上從零到設定值的隨機毫秒數。由於 jitter 在 cap 之後才加入，最終 delay 可能超出 `maxDelayMs`，但差值會小於 `jitter`。

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

後續嘗試會把最新 event ID 放在 `Last-Event-ID`。`shouldReconnect` 必須保持不 throw。目前無法保證 predicate throw 或 reject 時，每個 pending iterator 或 `stream.closed` 路徑都一定會 settle。

HTTP/open validation failure、message-processing fatal error 與正常 EOF，和可重試的 network/read failure 並不相同。不要假設每個終止路徑都會重連。

## 共用工作佇列

Async iterable 是邏輯 stream 的單一共用工作佇列，不是 subscription、broadcast 或 backpressure mechanism。

佇列預設無界。可用 `withSSEQueue(...)` 或 `withSSEOptions({ queue })` 設定上限：

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | 達到上限時的行為                          |
| ------------- | ----------------------------------------- |
| `drop-newest` | 丟棄剛到達的事件。                        |
| `drop-oldest` | 移除最舊的 buffered event，再加入新事件。 |
| `error`       | 拋出 queue overflow error 並終止處理。    |

多個 iterator 會競爭同一批值，不會各拿到一份副本。跳出一個 `for await` loop 不會關閉 transport，因為 iterator 沒有具備生命週期感知的 `return()` 實作。請明確呼叫 `stream.close(...)`。

關閉會把 queue 標成 done，但不會丟掉已 buffer 的值。Consumer 可以先排空這些值，下一次迭代才會看到 `done: true`。

### Parser Buffer 上限

Event queue 與 parser buffer 是兩回事。透過 `withSSEOptions(...)` 設定正數 `maxBufferSize`，可以限制不完整 SSE line 保留的 byte 數：

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

啟動後超出上限會 reject iterator，並以 `code: 'error'` 關閉 stream。省略此值時 parser buffer 沒有上限。

## 終止關閉

`stream.closed` 會 resolve：

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` 代表 response body 正常結束。
- `aborted` 包含明確呼叫 `stream.close(...)` 或取消路徑。
- `error` 代表停止重試或發生終止 stream error。

`stream.close(reason)` 是 idempotent。它會中止進行中的傳輸工作、停止讓新值進入 queue，並 settle `stream.closed`。單純 `break` 不會做這些事。

開啟 stream 的應用程式邊界負責關閉它。Client 或 framework provider 不會自動關閉。

## 下一步

- [WebSocket](/zh-Hant-TW/core/web-socket)說明雙向 session 與 opt-in 重連。
- [攔截器](/zh-Hant-TW/core/interceptors)說明 SSE header 修改與生命週期觀察。
- [錯誤](/zh-Hant-TW/core/errors)說明啟動 response 是否可用。
