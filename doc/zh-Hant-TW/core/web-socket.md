---
title: WebSocket
description: 定義訊息 envelope、啟動並觀察即時 session、消費 incoming work、設定 opt-in 重連與 heartbeat，並關閉自己擁有的資源。
---

# WebSocket

`defineWebSocket(...)` 會為 JSON-message WebSocket 端點建立指令建構器。

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## 訊息 Envelope

每個訊息都是 JSON object，並含有非空字串 `type`。這個 type 會從 `incoming` 或 `outgoing` 選擇 Struct。

Object payload 的欄位可以和 `type` 放在同一層：

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

Scalar 或 array payload 要放進 `data`：

```json
{ "type": "count", "data": 3 }
```

`type` 與 `data` 是保留的 envelope key。Object payload 自己若含有 `data` 欄位，請把整個 payload 包起來，避免 runtime 把該欄位誤認成 envelope payload：

```typescript
const audit = defineWebSocket({
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

對應的 wire shape 是 `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`。

不要把 `type` 宣告成一般 payload field；envelope normalization 會管理它。

選用的 `incoming.default` Struct 會處理其他未宣告 message type。沒有它時，unknown type 會直接被丟棄。

## 啟動 Tuple

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

WebSocket 回傳：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功時第三個元素是啟動連線快照，可能包含第一個實體 socket 開啟時捕捉的 `url`、`protocol` 與 `extensions`。

`session.connection` 是即時 getter。重連會取代底層實體 socket，也可能更新這個值。啟動快照很重要時，請保留 tuple 的第三個元素。

不要記錄 connection URL，其中可能含 path identifier、應用程式 query data 與 telemetry propagation field。

## 即時 Session

`WebSocketSession` 是一個邏輯 session，可以跨越多次實體連線嘗試。

| Member                     | 行為                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `connection`               | 最新連線資訊的即時 getter。                                |
| `state`                    | 邏輯 session state 的即時 getter。                         |
| `receive`                  | 已驗證 incoming message 的共用 async 工作佇列。            |
| `send(message)`            | 驗證、序列化，接著送出或排入 outgoing message。            |
| `close(code?, reason?)`    | 請求終止關閉。                                             |
| `closed`                   | 取得觀察到的終止關閉資訊的 Promise。                       |
| `onStateChange(listener)`  | 加入 state observer，並回傳 unsubscribe function。         |
| `onRuntimeError(listener)` | 加入 runtime-error observer，並回傳 unsubscribe function。 |

Client 回傳 session 後就不再追蹤它。呼叫端負責消費、觀察器、取消與關閉。

## 接收訊息

Text、ArrayBuffer、typed array 與 Blob message 都會解碼成 UTF-8 JSON。以下輸入會直接被丟棄，不會回報：

- 無效 JSON；
- 非 object envelope；
- 遺漏 `type`，或 `type` 是空字串；
- 沒有 `incoming.default` Struct 的 unknown type。

選中 Struct 後，解碼失敗會送到 `onRuntimeError`，該訊息則被丟棄。

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

Incoming iterable 是單一、無界的共用工作佇列。多個 iterator 會競爭 message，不是各自獨立的 subscription。Queue 增長時 transport 不會讓伺服器減速。請持續消費 incoming message，否則就要盡快關閉 session。

## 傳送訊息

`send(...)` 是同步函式，以下情況可能同步 throw：

- 端點沒有 `outgoing` map；
- message 沒有有效 `type`；
- type 未宣告；
- payload 結構解碼或編碼失敗；
- 有界 send queue 使用 `overflow: 'error'`；
- 立即傳送時 native socket throw。

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

在 socket 開啟前，或兩次 reconnect attempt 之間送出的 message，會進入 outgoing send queue。實體 socket 開啟時會 flush queue。

進入 terminal state 後不要呼叫 `send`。目前實作沒有穩定的 post-close rejection 契約，終止關閉後排入 queue 的資料也可能永遠不會送出。

## State

`session.state` 可能是：

| State          | 意義                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `idle`         | 執行開始前的初始內部狀態。                                                                                |
| `connecting`   | 第一次實體連線嘗試即將開始。                                                                              |
| `open`         | 實體 socket 開啟後，最近一次送出的邏輯狀態。等待重新連線時，即使實體 socket 已不存在，仍可能維持 `open`。 |
| `reconnecting` | Delay 結束後，後續實體連線嘗試即將開始。                                                                  |
| `closing`      | 因取消而關閉 active connecting/open socket。                                                              |
| `closed`       | 沒有正規化錯誤的終止關閉。                                                                                |
| `aborted`      | 外部取消被正規化成 `ABORTED` 後終止。                                                                     |
| `error`        | 其他終止失敗。                                                                                            |

Delay 期間不會 emit `reconnecting`；等 delay 結束、下一次嘗試開始時才會 emit。`session.state` 只是最近一次送出的生命週期狀態，不能證明目前一定存在 native socket。這段空檔中送出的訊息會進入 outgoing queue。

State listener 會直接執行。請保持不 throw，並在擁有者結束時 unsubscribe。

### 每次嘗試前

`beforeConnect` 可以設定在 client 或單次執行上。初次嘗試與每次 reconnect attempt 都會在 native constructor 前執行：

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

此時 command input 與 request projection 已建構完成。Hook 不會重新執行 `build`，也無法改變已綁定的 query value。它適合做應用程式自有的準備，例如刷新環境 handshake mechanism 使用的狀態。Throw 或 rejection 是終止 transport failure，不會交給 close-outcome reconnect predicate。

## 重連必須明確啟用

沒有 reconnect object 就不會重連。可在 client 或單次執行設定：

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

`attempts` 指初次嘗試後的重試次數。傳入空物件會啟用三次重試，預設值如下：

| 欄位              | 預設值                                 |
| ----------------- | -------------------------------------- |
| `attempts`        | `3`                                    |
| `delayMs`         | `1000`                                 |
| `factor`          | `2`                                    |
| `maxDelayMs`      | `30000`                                |
| `jitter`          | `0`                                    |
| `shouldReconnect` | 對每一種 close outcome 都回傳 `true`。 |

預設 predicate 會重試乾淨與不乾淨的 remote close。若 clean close 應該終止 session，請自訂 predicate。第一次重試的 `attempt` 從 1 開始。

Base delay 是 `min(delayMs * factor ** (attempt - 1), maxDelayMs)`。WebSocket jitter 採乘法：例如 `0.2` 會從 `0.8` 到 `1.2` 選一個隨機乘數。這和 SSE 的加法毫秒 jitter 不同。

`shouldReconnect` 必須保持同步且不 throw。Reconnect 會在同一個邏輯 session 內建立新的實體 socket；incoming 與 outgoing queue 都屬於這個邏輯 session。

## Heartbeat

Heartbeat 也必須明確啟用：

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

`message` 必須產生符合端點 outgoing map 的值。被 `isAck` 識別的 message 會清除 heartbeat timeout，而且不會放進 `receive`。

正數 `timeoutMs` 到期時，runtime 會對 runtime-error listener emit `Error('WebSocket heartbeat timeout')`，並請求 native close code `4000`、reason `heartbeat timeout`。是否重連仍取決於另一份允許這個 close 結果的 reconnect policy。

請保持 `timeoutMs < intervalMs`。目前實作不驗證這個關係，timeout 等於或大於 interval 時，可能和後續 heartbeat timer 重疊。

## Queue

`queue` option 只設定 outgoing message：

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

Outgoing queue 預設無界。設定上限後，預設 overflow mode 是 `drop-oldest`；也可選 `drop-newest` 與 `error`。終止關閉會清空 send queue。

Incoming queue 沒有公開的上限或 overflow option。它是無界的共用工作佇列，也不提供 backpressure。資源擁有者必須持續消費，否則就關閉 session。

## 關閉責任

`session.close(code, reason)` 會呼叫目前 native socket 的 `close` method，並用 manual-close marker abort 邏輯 session。它只提出關閉請求，不保證完成 graceful handshake、出現可見的 `closing` state，也不保證最後 `closed` 的值會原樣回傳要求的 code 與 reason。

`session.closed` 會依 runtime 觀察到的 close information resolve：

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

Native 實作若一直不 emit close event，settlement 可能被延後。外部取消依正規化 reason 不同，可能以 `aborted` 或 `error` 結束；若 session 正好在兩次 attempt 之間，也可能跳過 `closing`。

請在開啟 session 的 component、route、job 或 service boundary unsubscribe listener 並關閉資源。Provider unmount 本身不會做這些事。

## URL 與認證安全性

HTTP base URL 會轉成 WebSocket scheme：`http:` 變成 `ws:`，`https:` 變成 `wss:`。Path placeholder 不做 segment encoding，query value 則使用已設定的 serializer。

Protocol 優先順序依序是 execution option、client option、endpoint definition。明確傳入空 protocol array 會蓋掉低優先權設定。

瀏覽器 WebSocket API 無法設定任意 handshake header。不要把 query parameter 當成通用 credential channel；URL 可能被瀏覽器工具、proxy、access log 與 telemetry 記錄。請使用 TLS（`wss:`），並針對部署環境審查 authentication 設計，例如適當的 same-site cookie flow 或短效 connection ticket。

## 下一步

- [SSE](/zh-Hant-TW/core/sse)對照 stream retry 與 queue 行為。
- [攔截器](/zh-Hant-TW/core/interceptors)示範如何保留即時 session getter。
- [錯誤](/zh-Hant-TW/core/errors)說明啟動 tuple failure。
