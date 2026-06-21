---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` 透過 `defineWebSocket` 提供類型 WebSocket 端點。每個端點宣告：

- `incoming` 結構描述 — 伺服器發送給用戶端的訊息。
- `outgoing` 結構描述 — 用戶端發送給伺服器的訊息。
- `input` 結構描述 + `build` 處理器 — 請求參數與查詢／路徑建構（選填）。

訊息以 JSON 編碼，並在執行階段依宣告的結構描述進行驗證。

## 定義 WebSocket 端點

使用 `defineWebSocket` 建立類型指令建構器。再以 `client.execute()` 執行。

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // 選填：從輸入建構連線 URL
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // 伺服器 → 用戶端的訊息
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // 用戶端 → 伺服器的訊息
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### 結構描述形狀

**傳入訊息**以 `type` 為鍵。訊息抵達時，其 JSON `type` 欄位會與結構描述鍵匹配。若承載為純物件，其欄位會與 `type` 合併：

```typescript
// 伺服器發送: { "type": "message", "text": "hi", "userId": 1 }
// 用戶端接收: { type: 'message', text: 'hi', userId: 1 }
```

若承載為純量或陣列，則套件裝於 `data` 下：

```typescript
// 伺服器發送: { "type": "notification", "data": [1, 2, 3] }
// 用戶端接收: { type: 'notification', data: [1, 2, 3] }
```

**傳出訊息**遵循相同慣例。`send()` 方法接受 `type` 匹配 `outgoing` 鍵之一的訊息：

```typescript
socket.send({ type: 'message', text: 'hello' })
```

`incoming` 中可使用特殊的 `default` 鍵，以共享結構描述捕捉未宣告的訊息類型。

## 執行與消費訊息

`client.execute()` 回傳 `[error, socket, connection]`：

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // 處理啟動失敗（驗證、傳輸、取消等）
  return
}

// 迭代傳入訊息
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// 或直接使用 async iterator
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## `WebSocketSession` API

| 成員                       | 類型                                       | 說明                                                              |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | 底層 socket 的 `{ url?, protocol?, extensions? }`。               |
| `state`                    | `WebSocketState`                           | 目前生命週期狀態（見下方）。                                      |
| `receive`                  | `AsyncIterable<TIncoming>`                 | 已驗證傳入訊息的 async iterator。                                 |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | socket 關閉時解析，回傳 `{ code?, reason?, wasClean?, cause? }`。 |
| `send(message)`            | `(message: TOutgoing) => void`             | 發送傳出訊息。尚未開啟時會進入隊列。                              |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | 優雅關閉連線。                                                    |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | 回傳取消訂閱函式。                                                |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | 回傳取消訂閱函式。                                                |

```typescript
// 狀態監控
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// 執行階段錯誤（結構描述失敗、心跳逾時等）
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// 優雅關閉
socket.close(1000, 'done')
await socket.closed
```

## 連線生命週期狀態機

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| 狀態           | 含義                                                   |
| -------------- | ------------------------------------------------------ |
| `idle`         | 尚未呼叫 `execute()`。                                 |
| `connecting`   | 首次嘗試開啟連線。                                     |
| `open`         | 連線已建立，可流通訊息。                               |
| `closing`      | `close()` 或 `abort` 被觸發，等待 close 事件。         |
| `closed`       | 乾淨關閉（無錯誤，或手動關閉）。                       |
| `reconnecting` | 連線中斷，等待重試。                                   |
| `error`        | 終端失敗（驗證錯誤、傳輸錯誤、非取消的關閉附帶原因）。 |
| `aborted`      | 透過 `AbortSignal` 或 `close()` 明確取消。             |

狀態轉換會透過 `onStateChange` 發射。`receive` async iterator 在 socket 到達終端狀態（`closed`、`error` 或 `aborted`）時結束。

## 心跳

設定週期性 ping/ack 以保持連線活性，或偵測死亡對端。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // 每 30 秒發送一次
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // 預期在 10 秒內收到 ack
    isAck: (message) => message.type === 'pong',
  },
})
```

| 選項         | 說明                                                         |
| ------------ | ------------------------------------------------------------ |
| `intervalMs` | 心跳發送間隔（必填）。                                       |
| `message`    | 回傳心跳訊息的工廠函式。類型對應 `TOutgoing`。               |
| `timeoutMs`  | 若設定，ack 未在時限內抵達時，socket 會以 code `4000` 關閉。 |
| `isAck`      | 斷言函式，識別傳入訊息是否為心跳 ack。                       |

心跳可在用戶端層級設定（透過 `createClient({ webSocket: { heartbeat: ... } })`）或請求層級設定（透過 `execute()` 選項）。請求層級設定優先。

## 重連

連線意外中斷時會觸發自動重連。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| 選項              | 預設值       | 說明                                   |
| ----------------- | ------------ | -------------------------------------- |
| `attempts`        | `3`          | 最大重試次數。`<= 0` 表示停用重連。    |
| `delayMs`         | `1000`       | 首次重試前的基礎延遲。                 |
| `factor`          | `2`          | 指數退避乘數。                         |
| `maxDelayMs`      | `30000`      | 計算延遲的上限。                       |
| `jitter`          | `0`          | 隨機化因子（`0`–`1`）。                |
| `shouldReconnect` | `() => true` | 斷言函式，決定特定關閉是否應觸發重試。 |

延遲公式：`min(delayMs * factor^(attempt - 1), maxDelayMs)`，再套用抖動。

重連也可透過用戶端層級 `createClient({ webSocket: { reconnect: ... } })` 設定。

## 發送隊列

在 socket 尚未 `open`（或暫時斷線期間）發送的訊息會進入隊列，待連線就緒後一次送出。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| 選項       | 說明                           |
| ---------- | ------------------------------ |
| `maxSize`  | 隊列最大訊息數。預設為無限制。 |
| `overflow` | `maxSize` 超額時的行為。       |

隊列在終端關閉（`error`、`aborted`、`closed`）時清除。

## 手動關閉與取消行為

### `socket.close(code?, reason?)`

執行優雅關閉：

1. 呼叫原生 `WebSocket.close(code, reason)`。
2. 以 `manual-web-socket-close` 原因取消內部 `AbortController`。
3. socket 依序過渡 `closing` → `closed`。
4. `socket.closed` 解析為提供的 `code` 與 `reason`。

### `AbortSignal`（外部）

透過 `execute()` 選項傳入外部 `AbortSignal`：

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// 稍後：
controller.abort() // 立即關閉 socket 並過渡至 'aborted'
```

若在 socket 開啟**前**取消，`execute()` 會以傳輸錯誤解析，且 `socket` 為 `undefined`。若在開啟**後**取消，socket 過渡至 `aborted` 且 `receive` 結束。

### `timeout`

支援請求層級逾時，但不可與同一請求的 `abort` 同時使用（會回傳定義錯誤）：

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// 錯誤 — 不可混用 abort 與 timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## 完整範例

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## 接下來

- [SSE →](/core/sse) — 具備類型結構描述與重連的 Server-Sent Events。
- [用戶端 →](/core/client) — 用戶端建立與 WebSocket 設定。
- [指令 →](/core/commands) — `defineWebSocket` 輸入與建構規則。
