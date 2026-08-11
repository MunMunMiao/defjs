---
title: SSE
description: 定義並解碼有界 Server-Sent Events、設定重連，並關閉自己擁有的 stream。
---

# SSE

`defineEventStream(...)` 會建立 SSE 指令建構器。端點會宣告 path，以及每個 event name 要使用的 Struct。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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

HTTP、SSE 與 WebSocket 執行的 `timeout` 必須是 `1..2_147_483_647` 範圍內的正安全整數；`0`、負數、小數、`NaN`、`Infinity` 或超過上限的值會在建立 request、stream 或 socket 資源前回傳 `REQUEST_VALIDATION_FAILED`。

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
    await stream.closed
  }
}
```

`execute` 成功代表啟動完成。啟動後發生的錯誤會透過 iterator rejection 與 `stream.closed` 出現，不會回頭改變原始 tuple 的 `error` 項目。

透過 `break`、`return` 或 throw 提早離開 `for await` 迴圈時，會呼叫 iterator 的 `return()`。Stream 會自動以 `{ code: 'aborted', reason: 'iterator-return' }` 關閉；await `stream.closed` 即可觀察這個終止狀態。只有 owner 需要從活動 iteration 外部關閉時，才明確呼叫 `stream.close(...)`。

## 無效事件

透過 `withSSEOnInvalidEvent(...)` 或 `withSSEOptions(...)` 設定 `onInvalidEvent`：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

Observer 會收到：

- `reason: 'missing-struct' | 'validation-failed'`；
- 原始事件的 `id`、name 與 data text；
- validation failure 的 `cause`。
- 目前 attempt 的 `signal`。

這個事件會被丟棄，後續有效事件仍可正常送出。Observer throw 與 rejected promise 會被隔離；abort 會透過 `signal` 立即中斷 pending observer。請保持快速，並在記錄 `id`、`data` 與 `cause` 前遮罩。

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

後續 attempt 會把最新 event ID 放在 `Last-Event-ID`。`shouldReconnect` throw 或 reject 時會停止 retry，並讓 pending startup 或 stream 以該 policy error settle。Abort 會透過目前 attempt signal 中斷 pending predicate。

HTTP/open validation failure、message-processing fatal error 與正常 EOF，和可重試的 network/read failure 並不相同。不要假設每個終止路徑都會重連。

## 端點自有資源上限

一個 stream 只允許一個 async iterator consumer；建立第二個 iterator 會拋錯。Iterator return（包括提早 `break` 離開 `for await`）會自動以 reason `iterator-return` 關閉 stream。

每個定義都必須提供正安全整數 `maxBufferSize` 與 `maxQueueSize`。前者限制每條 SSE line 與目前 event 的累計 data，後者限制等待 consumer 的已解析 event。Queue overflow 是 fatal error，不會靜默丟棄 event。

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

正常 EOF 允許 consumer 排空已 buffered event。Fatal parser、transform 或 overflow error 會清空 buffer、cancel active body、reject iteration，並讓 `stream.closed` 以 `code: 'error'` settle。

## 終止關閉

`stream.closed` 會 resolve 為 discriminated union：

```typescript
type EventStreamCloseInfo =
  | { code: 'eof'; reason?: string; cause?: unknown }
  | { code: 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

- `eof` 代表 response body 正常結束。
- `aborted` 包含明確呼叫 `stream.close(...)` 或取消路徑。
- `error` 代表停止重試或發生終止 stream error；該分支一定包含公開的 `errorCode`。

`EventStreamErrorCode` 有六個穩定值：

| Error code                  | 含義                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `INVALID_RESPONSE`          | Status、content type、response error 或 response body 無效。 |
| `MESSAGE_PROCESSING_FAILED` | Event transform 或 lifecycle callback 失敗。                 |
| `PARSER_LIMIT_EXCEEDED`     | 超出端點自有的 parser buffer limit。                         |
| `QUEUE_OVERFLOW`            | 已解析 event 超出端點自有的 queue bound。                    |
| `TIMEOUT`                   | Transport attempt 達到設定的 timeout。                       |
| `TRANSPORT_ERROR`           | 發生其他終止 network、stream read 或 retry policy failure。  |

`stream.close(reason)` 是 idempotent。它會中止進行中的傳輸工作、停止讓新值進入 queue，並 settle `stream.closed`。Iterator `return()` 會以 reason `iterator-return` 使用相同 close path。

一般日誌只應記錄 `close.code`，以及 `error` 分支中的 `close.errorCode`。沒有明確的遮罩與保存政策時，不要記錄 `reason`、`cause`、raw event 或 stream URL。

開啟 stream 的應用程式邊界負責關閉它。Client 或 framework provider 不會自動關閉。

## 下一步

- [WebSocket](/zh-Hant-TW/core/web-socket)說明雙向 session 與 opt-in 重連。
- [攔截器](/zh-Hant-TW/core/interceptors)說明 SSE header 修改與生命週期觀察。
- [錯誤](/zh-Hant-TW/core/errors)說明啟動 response 是否可用。
