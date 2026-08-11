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
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
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
  maxIncomingQueueSize: 100,
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

HTTP、SSE 與 WebSocket 執行的 `timeout` 必須是 `1..2_147_483_647` 範圍內的正安全整數；`0`、負數、小數、`NaN`、`Infinity` 或超過上限的值會在建立 request、stream 或 socket 資源前回傳 `REQUEST_VALIDATION_FAILED`。

WebSocket 回傳：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功時第三個元素是 `generation: 1` 的啟動連線快照，可能包含第一個實體 socket 的 `url`、`protocol` 與 `extensions`。

`session.connection` 是即時 getter；每次實體 socket 成功開啟都會遞增 `generation`。啟動快照很重要時，請保留 tuple 的第三個元素。

不要記錄 connection URL，其中可能含 path identifier、應用程式 query data 與 telemetry propagation field。

## 失敗診斷

使用 browser WebSocket API，或只暴露 standard WebSocket event surface 的 injected constructor 時，transport-level handshake failure 通常只能提供穩定的 `RequestError` `kind: 'transport'`，以及 `NETWORK_ERROR`、`ABORTED` 或 `TIMEOUT` 等 `code`。不能保證取得 HTTP `401`、其他 handshake status、response header/body，或 Node 特有的 `unexpected-response` detail。runtime-specific constructor 可以在自己的 adapter boundary 暴露更多資訊，但那不是 portable Core contract。

成功啟動後，應等待 `session.closed`，優先使用其中的 `kind`、選用 close `code` 與選用 `wasClean` 作為終止診斷。Close code 是 WebSocket close code，不是 HTTP status。Routine log 只保留經過審查的 low-cardinality context 與這些欄位；不要記錄 connection URL、query、ticket、raw `cause` 或 `reason`。只有具備明確 redaction、access 與 retention policy 時才擴充記錄。

## 即時 Session

`WebSocketSession` 是一個邏輯 session，可以跨越多次實體連線嘗試。

| Member                     | 行為                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `connection`               | 最新連線資訊的即時 getter。                                |
| `bufferedAmount`           | Native socket 尚未送出的 byte 數；沒有 socket 時為 `0`。   |
| `state`                    | 邏輯 session state 的即時 getter。                         |
| `receive`                  | 已驗證 incoming message 的共用 async 工作佇列。            |
| `send(message)`            | 先檢查可寫性，再驗證、序列化、送出或排入 queue。           |
| `close(code?, reason?)`    | 請求終止關閉。                                             |
| `closed`                   | 取得觀察到的終止關閉資訊的 Promise。                       |
| `onStateChange(listener)`  | 加入 state observer，並回傳 unsubscribe function。         |
| `onRuntimeError(listener)` | 加入 runtime-error observer，並回傳 unsubscribe function。 |

Client 回傳 session 後就不再追蹤它。呼叫端負責消費、觀察器、取消與關閉。

## 接收訊息

Text、ArrayBuffer、typed array 與 Blob message 會按抵達順序解碼成 UTF-8 JSON。以下輸入會直接被丟棄，不會回報：

- 非 object envelope；
- 遺漏 `type`，或 `type` 是空字串；
- 沒有 `incoming.default` Struct 的 unknown type。

無效 JSON 與已選 Struct 的驗證失敗會送到 `onRuntimeError`；frame 會被丟棄，session 繼續執行。

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

`receive` 只允許一個 iterator。`maxIncomingQueueSize` 是必填的正 item 上限；overflow 會清空緩衝、讓 iterator 失敗，並以 `error` 終止 session。

## 傳送訊息

`send(...)` 是同步函式，以下情況可能同步 throw：

- 端點沒有 `outgoing` map；
- message 沒有有效 `type`；
- type 未宣告；
- payload 結構解碼或編碼失敗；
- reconnecting 時 endpoint-owned outgoing queue 已停用或已滿；
- 立即傳送時 native socket throw。

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

邏輯可寫性會在 payload 驗證與序列化前檢查。只有邏輯 state 與目前實體 socket 都是 `open` 才會直接傳送；只有 `reconnecting` 且端點的 `maxOutgoingQueueSize` 是正數時才會排入 queue。保留的 FIFO 會在 replacement socket 發出 `open` 前 flush。

Manual closing、terminal state，以及 remote close 後 reconnect predicate 尚未決定的窗口都會讓 `send` throw `InvalidStateError`。Transport 不會 replay 已送到先前實體 socket 的 frame。

## State

`session.state` 可能是：

| State          | 意義                                  |
| -------------- | ------------------------------------- |
| `idle`         | 執行開始前的初始內部狀態。            |
| `connecting`   | 第一次實體連線嘗試即將開始。          |
| `open`         | 目前實體 socket 已開啟。              |
| `reconnecting` | 後續實體連線嘗試正在準備或 delay。    |
| `closing`      | 擁有者要求 manual close。             |
| `closed`       | 沒有正規化錯誤的終止關閉。            |
| `aborted`      | 外部取消被正規化成 `ABORTED` 後終止。 |
| `error`        | 其他終止失敗。                        |

`session.state` 是邏輯生命週期，不能證明目前一定存在 native socket。`reconnecting` 期間，`send` 使用端點擁有的 outgoing capacity。

Observer failure 會被隔離：state-listener failure 會通知 runtime-error listener；runtime-error listener failure 會轉送到可用的 `globalThis.reportError`。Terminal settlement 會釋放 observer；擁有者更早結束時仍應 unsubscribe。

### 每次嘗試前

`beforeConnect` 可以設定在 client 或單次執行上。初次嘗試與每次 reconnect attempt 都會在 native constructor 前執行：

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

Hook 接收 `{ attempt, signal }`；首次 `attempt` 是 `0`，reconnect 時遞增。請把 `signal` 傳給 owned async work。Abort 與 timeout 會和 hook race、消費 late rejection，並阻止 late result 建立 socket。Throw 或 rejection 是終止 transport failure。

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

`shouldReconnect` 必須同步；throw 會使 session 以 `error` 終止，明確回傳 `false` 則以 `closed` 終止。Reconnect 只建立同一邏輯 session 的新實體 socket，不會 replay 先前 send。應用程式可在 `session.connection.generation` 增加時只恢復仍 active、可安全 replay 的 subscription，絕不可 replay mutation。

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

Heartbeat serialization、send、ack predicate 與 timeout failure 都是 fatal：會通知 runtime-error listener、讓 `receive` 失敗，並使 session 以 `error` 終止，不會詢問 reconnect policy。

`intervalMs` 與已定義的 `timeoutMs` 都必須是正有限值，且不超過 `2_147_483_647`。一個 ack deadline 生效期間，後續 interval 不會送出新 ping 或重設 deadline；ack 或 session stop 會清除它。

## Queue

Queue limit 由 endpoint definition 擁有。`maxIncomingQueueSize` 是必填的正 safe integer；overflow 會清空緩衝並以 fatal error 終止。`maxOutgoingQueueSize` 是可選的非負 safe integer，預設 `0`；正數容量會在連線嘗試之間按 FIFO 保留 frame，overflow 會拒絕新 frame，而不會刪除舊 frame。

兩個 limit 都以 item 而非 byte 計數。`session.bufferedAmount` 另外公開 native socket 尚未送出的 byte。`receive` 只允許一個 iterator。

## 關閉責任

`session.close(code, reason)` 會先驗證 code 必須是 `1000` 或 `3000..4999`，reason 最多 123 個 UTF-8 byte。合法輸入進入 `closing`、請求 native close，並等待實際 `CloseEvent`；觀察到的 code/reason 優先於 requested value。

`session.closed` 會依 runtime 觀察到的 close information resolve：

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

Manual close、沒有 cause 的 remote close 與明確拒絕 reconnect 都產生 `closed`。External abort 產生 `aborted`；timeout 與 runtime failure 產生 `error`。Native close throw 時只做一次無參數 fallback；兩次都 throw 就直接以 `error` settle，不會第三次呼叫 close。

請在開啟 session 的 component、route、job 或 service boundary unsubscribe listener 並關閉資源。Provider unmount 本身不會做這些事。

## URL 與認證安全性

HTTP base URL 會轉成 WebSocket scheme：`http:` 變成 `ws:`，`https:` 變成 `wss:`。請提供 raw path-placeholder value；Core 會逐 segment 精確 encode 一次，`%` 會變成 `%25`，並拒絕空值、`.` 與 `..`。Query value 使用已設定的 serializer。

Protocol 優先順序依序是 execution option、client option、endpoint definition。明確傳入空 protocol array 會蓋掉低優先權設定。

瀏覽器 WebSocket API 無法設定任意 handshake header。不要把 query parameter 當成通用 credential channel；URL 可能被瀏覽器工具、proxy、access log 與 telemetry 記錄。請使用 TLS（`wss:`），並針對部署環境審查 authentication 設計，例如適當的 same-site cookie flow 或短效 connection ticket。

## 下一步

- [SSE](/zh-Hant-TW/core/sse)對照 stream retry 與 queue 行為。
- [攔截器](/zh-Hant-TW/core/interceptors)示範如何保留即時 session getter。
- [錯誤](/zh-Hant-TW/core/errors)說明啟動 tuple failure。
