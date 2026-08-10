---
title: WebSocket
description: 定義 message envelope、啟動並觀察 live session、讀取 incoming work、設定 opt-in reconnect 與 heartbeat，並關閉自己擁有的 resource。
---

# WebSocket

`defineWebSocket(...)` 為 JSON-message WebSocket endpoint 建立 command builder。

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

## Message Envelope

每條 message 都是 JSON object，並有一個非空 string `type`。Runtime 會按 type 從 `incoming` 或 `outgoing` 選取 Struct。

Object payload 的欄位可以與 `type` 同級：

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

Scalar 或 array payload 要放進 `data`：

```json
{ "type": "count", "data": 3 }
```

`type` 與 `data` 是 reserved envelope key。如果 object payload 自己有 `data` 欄位，請把整個 payload 包入 `data`，否則 runtime 會把該欄位誤認成 envelope payload：

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

不要把 `type` 宣告成一般 payload 欄位；envelope normalization 會管理這個 key。

可選的 `incoming.default` Struct 會處理其他未宣告 message type。沒有它時，unknown type 會被丟棄。

## Startup Tuple

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

HTTP、SSE 與 WebSocket execution 的 `timeout` 必須是 `1..2_147_483_647` 範圍內的正安全整數；`0`、負數、小數、`NaN`、`Infinity` 或超出上限的值會在建立 request、stream 或 socket 資源前回傳 `REQUEST_VALIDATION_FAILED`。

WebSocket 回傳：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功時，第三項是 `generation: 1` 的 startup-connection snapshot，可以包含第一個實體 socket 的 `url`、`protocol` 與 `extensions`。

`session.connection` 是 live getter；每次實體 socket 成功 open 都會遞增 `generation`。需要 startup snapshot 時，請保留 tuple 第三項。

不要記錄 connection URL，因為可能包含 path identifier、應用程式 query data 與 telemetry propagation 欄位。

## Live Session

一個 `WebSocketSession` 是 logical session，可以橫跨多次實體 connection attempt。

| Member                     | 行為                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `connection`               | 最新 connection information 的 live getter。               |
| `bufferedAmount`           | Native socket 尚未送出的 byte 數；沒有 socket 時為 `0`。   |
| `state`                    | Logical session state 的 live getter。                     |
| `receive`                  | 已驗證 incoming message 的共用 async work queue。          |
| `send(message)`            | 先檢查可寫性，再驗證、serialize、send 或 enqueue。         |
| `close(code?, reason?)`    | 請求 terminal close。                                      |
| `closed`                   | 回傳 observed terminal-close information 的 promise。      |
| `onStateChange(listener)`  | 加入 state observer，並回傳 unsubscribe function。         |
| `onRuntimeError(listener)` | 加入 runtime-error observer，並回傳 unsubscribe function。 |

Client 回傳 session 後不會再追蹤。呼叫方要負責讀取 incoming message、管理 observer、cancellation 與 close。

## 接收 Message

Text、ArrayBuffer、typed-array 與 Blob message 會按到達次序 decode 成 UTF-8 JSON。以下 input 會直接丟棄而不報錯：

- non-object envelope；
- 缺少 `type`，或 `type` 並非非空 string；
- 沒有 `incoming.default` Struct 可處理的 unknown type。

Invalid JSON 與已選 Struct 的 validation failure 會傳給 `onRuntimeError`；frame 會被丟棄，session 繼續運作。

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

`receive` 只容許一個 iterator。`maxIncomingQueueSize` 是必填的正 item 上限；overflow 會清空 buffer、令 iterator 失敗，並以 `error` 終止 session。

## 傳送 Message

`send(...)` 是同步 method。以下情況會同步拋錯：

- endpoint 沒有 `outgoing` map；
- message 沒有 valid `type`；
- type 未宣告；
- payload 結構式解碼或 encoding 失敗；
- reconnecting 時 endpoint-owned outgoing queue 被停用或已滿；
- immediate send 時 native socket throw。

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

邏輯可寫性會在 payload validation 與 serialization 前檢查。只有邏輯 state 與目前實體 socket 都是 `open` 才會直接傳送；只有 `reconnecting` 且 endpoint 的 `maxOutgoingQueueSize` 是正數時才會 enqueue。保留的 FIFO 會在 replacement socket 發出 `open` 前 flush。

Manual closing、terminal state，以及 remote close 後 reconnect predicate 尚未決定的窗口都會令 `send` 拋出 `InvalidStateError`。Transport 不會 replay 已傳送到先前實體 socket 的 frame。

## State

`session.state` 可以是：

| State          | 含義                                                               |
| -------------- | ------------------------------------------------------------------ |
| `idle`         | Execution 開始前的初始內部 state。                                 |
| `connecting`   | 第一個實體 connection attempt 正在開始。                           |
| `open`         | 目前實體 socket 已打開。                                           |
| `reconnecting` | 下一個實體 connection attempt 正在準備或 delay。                   |
| `closing`      | 擁有者要求 manual close。                                          |
| `closed`       | 沒有 normalized error 的 terminal close。                          |
| `aborted`      | External cancellation normalize 成 `ABORTED` 後的 terminal state。 |
| `error`        | 其他 terminal failure。                                            |

`session.state` 是 logical lifecycle，不能證明目前一定有 native socket。`reconnecting` 期間，`send` 使用 endpoint-owned outgoing capacity。

Observer failure 會被隔離：state-listener failure 會通知 runtime-error listener；runtime-error listener failure 會轉送至可用的 `globalThis.reportError`。Terminal settlement 會釋放 observer；擁有者更早結束時仍應 unsubscribe。

### 每次嘗試前

`beforeConnect` 可設定在 client 或單次 execution。首次 attempt 與每次 reconnect 時，都會在 native constructor 前執行：

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

Hook 接收 `{ attempt, signal }`；首次 `attempt` 是 `0`，reconnect 時遞增。把 `signal` 傳給 owned async work。Abort 與 timeout 會同 hook race、消費 late rejection，並阻止 late result 建立 socket。Throw 或 rejection 是 terminal transport failure。

## Reconnect 要明確啟用

沒有 reconnect object 就不會 reconnect。可在 client 或單次 execution 設定：

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

`attempts` 是首次 attempt 之後的 retry 次數。傳入 empty object 會啟用三次 retry，預設值如下：

| 欄位              | 預設值                             |
| ----------------- | ---------------------------------- |
| `attempts`        | `3`                                |
| `delayMs`         | `1000`                             |
| `factor`          | `2`                                |
| `maxDelayMs`      | `30000`                            |
| `jitter`          | `0`                                |
| `shouldReconnect` | 對所有 close outcome 回傳 `true`。 |

預設 predicate 會 retry clean 與 unclean remote close。如果 clean close 應直接 terminal，請設定 predicate。第一次 retry 的 `attempt` 是 1。

Base delay 為 `min(delayMs * factor ** (attempt - 1), maxDelayMs)`。WebSocket jitter 是 multiplicative：例如 `0.2` 會在 `0.8` 至 `1.2` 隨機選 factor。這與 SSE 額外加上毫秒數的 additive jitter 不同。

`shouldReconnect` 必須同步；throw 令 session 以 `error` 終止，明確回傳 `false` 則以 `closed` 終止。Reconnect 只建立同一 logical session 的新實體 socket，不會 replay 先前 send。應用程式可在 `session.connection.generation` 增加時只恢復仍 active、可安全 replay 的 subscription，絕不可 replay mutation。

## Heartbeat

Heartbeat 亦要明確啟用：

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

`message` 必須產生 endpoint `outgoing` map 接受的值。`isAck` 認出的 message 會清除 heartbeat timeout，不會加入 `receive`。

Heartbeat serialization、send、ack predicate 與 timeout failure 都是 fatal：會通知 runtime-error listener、令 `receive` 失敗，並讓 session 以 `error` 終止，不會諮詢 reconnect policy。

`intervalMs` 與已定義的 `timeoutMs` 都必須是正有限值，且不超過 `2_147_483_647`。一個 ack deadline 生效期間，後續 interval 不會傳送新 ping 或重設 deadline；ack 或 session stop 會清除它。

## Queue

Queue limit 屬於 endpoint definition。`maxIncomingQueueSize` 是必填的正 safe integer；overflow 會清空 buffer 並以 fatal error 終止。`maxOutgoingQueueSize` 是可選的非負 safe integer，預設 `0`；正數容量會在連線嘗試之間按 FIFO 保留 frame，overflow 會拒絕新 frame，不會刪除舊 frame。

兩個 limit 都按 item 而非 byte 計算。`session.bufferedAmount` 另行顯示 native socket 尚未送出的 byte。`receive` 只容許一個 iterator。

## Close Ownership

`session.close(code, reason)` 先驗證 code 必須是 `1000` 或 `3000..4999`，reason 最多 123 個 UTF-8 byte。有效輸入進入 `closing`、要求 native close，並等待實際 `CloseEvent`；觀察到的 code/reason 優先於 request value。

`session.closed` resolve 成 runtime 實際 observed 的 close information：

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

Manual close、無 cause 的 remote close 與明確拒絕 reconnect 都產生 `closed`。External abort 產生 `aborted`；timeout 與 runtime failure 產生 `error`。Native close throw 時只做一次無參數 fallback；兩次都 throw 就直接以 `error` settle，不會第三次呼叫 close。

請在開啟 session 的 component、route、job 或 service boundary unsubscribe listener 並關閉 session。單靠 provider unmount 不會完成這些工作。

## URL 與 Authentication 安全

HTTP base URL 會轉成 WebSocket scheme：`http:` 變成 `ws:`，`https:` 變成 `wss:`。請提供 raw path-placeholder value；Core 會逐 segment 精確 encode 一次，`%` 會變成 `%25`，並拒絕空值、`.` 與 `..`。Query 值使用 configured serializer。

Protocol precedence 依序是 execution option、client option、endpoint definition。明確傳入 empty protocol array 會 suppress 較低 precedence 的值。

Browser WebSocket API 不能設定任意 handshake header。不要把 query parameter 當成通用 credential channel；browser tool、proxy、access log 與 telemetry 都可能記錄 URL。請使用 TLS（`wss:`），並按部署環境審查 authentication design，例如合適的 same-site cookie flow 或 short-lived connection ticket。

## 下一步

- [SSE](/zh-Hant-HK/core/sse)：stream retry 與 queue behavior 的分別。
- [Interceptors](/zh-Hant-HK/core/interceptors)：如何保留 live session getter。
- [Errors](/zh-Hant-HK/core/errors)：startup tuple failure。
