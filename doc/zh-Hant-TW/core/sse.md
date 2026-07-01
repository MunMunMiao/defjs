---
title: SSE
description: 使用 defineEventStream 定義型別化的 Server-Sent Events 端點，並透過用戶端消費串流事件。
---

# SSE

Defjs 使用 `defineEventStream` 定義型別 SSE（Server-Sent Events）端點。執行後回傳三元組 `[error, stream, openInfo]`，其中 `stream` 為 async iterable，用於逐一消費伺服器推送的事件。

## 定義事件串流

定義 SSE 端點時，宣告 `events` 欄位將事件名稱對應到 struct。SSE 傳輸層將每個 `data:` 承載以原始文字送達；Defjs 會選擇對應的 struct，並依據該 struct 的內容種類解碼文字。

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
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

### 預設事件結構描述

若伺服器可能發送未在 `events` 中明確宣告的事件型別，可提供 `default` struct。若無 `default`，未知事件會被靜默捨棄。

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### 事件資料內容解碼

SSE 傳輸層將每個 `data:` 承載以文字送達。Defjs 會先從 `events[eventName] ?? events.default` 選出事件 struct，再依選定的 struct 解碼文字。

當伺服器對某個事件送出 JSON 文字時，請使用 `struct.json(inner)`。`struct.json(inner)` 會先對原始 SSE 文字執行 `JSON.parse`，再用 `inner` 解析結果值：

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

對於純文字承載：

- `struct.string()` 與 `struct.text()` 會讀取原始事件文字。
- `struct.number()` 會先修剪文字，並只接受有限數值。
- `struct.boolean()` 會先修剪文字，並只接受精確的 `true` 或 `false`。

單獨的 `struct.object(...)`、`struct.array(...)` 與 `struct.record(...)` 不會自動解析看似 JSON 的文字。若要處理 JSON 事件資料，請將它們包在 `struct.json(...)` 中。

### 帶輸入的事件串流

當串流需要查詢參數或請求主體時，請提供 `input` struct 與 `build` 函式。`build` 的簽名與 `defineRequest` 相同，支援 params、query 與 headers。

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## 執行結果

`client.execute()` 對 SSE 指令回傳三元組：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — 連線或驗證失敗時非 null；成功時為 null。
- **`stream`** — 成功時為可透過 `for await...of` 消費的 `EventStreamHandle`；失敗時為 `undefined`。
- **`open`** — 包含首次連線的回應資訊（`response` 與 `url`）。連線失敗時可能為 `undefined`。

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle 與 stream.closed

`EventStreamHandle` 實作 `AsyncIterable`，可直接搭配 `for await...of` 使用。另提供以下屬性：

| 屬性／方法                 | 說明                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `open`                     | 首次連線的 `EventStreamOpenInfo`（含 `response` 與 `url`） |
| `closed`                   | `Promise<EventStreamCloseInfo>`，串流完全關閉時解析        |
| `close(reason?)`           | 主動關閉串流，可選填原因                                   |
| `[Symbol.asyncIterator]()` | 回傳消費事件佇列的 async iterator                          |

`closed` 在以下情況解析：

- 伺服器正常結束（`code: 'eof'`）
- 透過 `stream.close()` 主動關閉（`code: 'aborted'`）
- 連線錯誤或重連耗盡（`code: 'error'`）

```typescript
// 主動關閉
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## 無效事件處理：onInvalidEvent

當伺服器發送的事件無法匹配 `events` 中任何 struct（或 `default`），或 struct 驗證失敗時，會觸發 `onInvalidEvent` 觀察者。它是用戶端層級設定，在 `createClient` 時透過 `sse.onInvalidEvent` 傳入。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: 驗證失敗時的原始錯誤
    },
  }),
)
```

`onInvalidEvent` 是**觀察者**：

常見的驗證失敗原因是：對 `data:` 欄位為 JSON 文字的事件宣告了 `struct.object(...)`。請改為宣告 `struct.json(struct.object(...))`。`struct.json(...)` 底下的無效 JSON 會被回報為 `validation-failed`，且不會以原始文字重試。

- 即使內部拋出例外，例外會被靜默忽略，串流繼續運作。
- 不會阻塞後續事件的消費。

## 重連與佇列設定

SSE 傳輸具備內建自動重連，可透過用戶端層級的 `sse.reconnect` 與 `sse.queue` 設定。

### 重連設定

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // 最大重試次數
      delayMs: 1000, // 初始重試間隔
      factor: 2, // 指數退避乘數
      maxDelayMs: 30000, // 最大重試間隔
      jitter: 1000, // 隨機抖動範圍（毫秒）
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

重連優先順序：

1. 若 `onerror` 回傳 `null`，停止重連。
2. 若 `shouldReconnect` 回傳 `false`，停止重連。
3. 若 `attempts` 超過限制，停止重連。
4. 否則，使用 `delayMs` + `factor` 指數退避 + `jitter` 計算下次重試間隔。

> 重連會自動攜帶 `Last-Event-ID` 標頭，讓伺服器可從斷點續傳。

### 佇列設定

事件抵達後會進入內部 async 佇列，再由疊代器消費。你可以限制佇列大小與溢位行為：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | 行為                                 |
| ------------- | ------------------------------------ |
| `drop-newest` | 捨棄新抵達的事件，保留佇列中的舊事件 |
| `drop-oldest` | 捨棄最舊的事件，為新事件騰出空間     |
| `error`       | 佇列滿時拋出錯誤，導致串流關閉       |

## 完整範例

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## 接下來

- [用戶端 →](/core/client) — `createClient` 與 `sse` 選項
- [指令 →](/core/commands) — 指令定義與輸入規則
- [WebSocket →](/core/web-socket) — WebSocket 連線與狀態管理
