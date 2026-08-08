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

WebSocket 回傳：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功時，第三項是 startup-connection snapshot，可以包含第一個實體 socket open 時擷取的 `url`、`protocol` 與 `extensions`。

`session.connection` 是 live getter。Reconnect 會取代底層實體 socket，亦可能更新這個值。需要 startup snapshot 時，請保留 tuple 第三項。

不要記錄 connection URL，因為可能包含 path identifier、應用程式 query data 與 telemetry propagation 欄位。

## Live Session

一個 `WebSocketSession` 是 logical session，可以橫跨多次實體 connection attempt。

| Member                     | 行為                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `connection`               | 最新 connection information 的 live getter。               |
| `state`                    | Logical session state 的 live getter。                     |
| `receive`                  | 已驗證 incoming message 的共用 async work queue。          |
| `send(message)`            | 驗證、serialize，再 send 或 enqueue outgoing message。     |
| `close(code?, reason?)`    | 請求 terminal close。                                      |
| `closed`                   | 回傳 observed terminal-close information 的 promise。      |
| `onStateChange(listener)`  | 加入 state observer，並回傳 unsubscribe function。         |
| `onRuntimeError(listener)` | 加入 runtime-error observer，並回傳 unsubscribe function。 |

Client 回傳 session 後不會再追蹤。呼叫方要負責讀取 incoming message、管理 observer、cancellation 與 close。

## 接收 Message

Text、ArrayBuffer、typed-array 與 Blob message 會當作 UTF-8 JSON decode。以下 input 會直接丟棄而不報錯：

- invalid JSON；
- non-object envelope；
- 缺少 `type`，或 `type` 並非非空 string；
- 沒有 `incoming.default` Struct 可處理的 unknown type。

選取 Struct 後，如 decoding failure，error 會傳給 `onRuntimeError`，該 message 亦會被丟棄。

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

Incoming iterable 是單一無界共用工作隊列。多個 iterator 會競爭 message，並非獨立 subscription。Queue 增長時，transport 不會要求 server 放慢。請持續讀取 incoming message，否則要盡快關閉 session。

## 傳送 Message

`send(...)` 是同步 method。以下情況會同步拋錯：

- endpoint 沒有 `outgoing` map；
- message 沒有 valid `type`；
- type 未宣告；
- payload 結構式解碼或 encoding 失敗；
- bounded send queue 使用 `overflow: 'error'`；
- immediate send 時 native socket throw。

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

在 open 前或 reconnect gap 傳送的 message 會進入 outgoing send queue；實體 socket open 後才 flush。

不要在 terminal state 後呼叫 `send`。目前實作沒有穩定的 post-close rejection contract；terminal close 後 enqueue 的 data 亦可能永遠不會送出。

## State

`session.state` 可以是：

| State          | 含義                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `idle`         | Execution 開始前的初始內部 state。                                                                             |
| `connecting`   | 第一個實體 connection attempt 正在開始。                                                                       |
| `open`         | 實體 socket 打開後，最近一次發出的邏輯 state。等候 reconnect 時，即使實體 socket 已不存在，仍可能維持 `open`。 |
| `reconnecting` | Delay 結束後，下一個實體 connection attempt 正在開始。                                                         |
| `closing`      | Cancellation 正在關閉 active connecting/open socket。                                                          |
| `closed`       | 沒有 normalized error 的 terminal close。                                                                      |
| `aborted`      | External cancellation normalize 成 `ABORTED` 後的 terminal state。                                             |
| `error`        | 其他 terminal failure。                                                                                        |

`reconnecting` 不會在 delay 期間發出；只會在 delay 完結、下一次 attempt 開始時發出。`session.state` 只是最近一次發出的 lifecycle state，不能證明目前一定有 native socket。這段空檔內送出的 message 會進入 outgoing queue。

State listener 會被直接呼叫。請確保不拋錯，並在擁有者結束時 unsubscribe。

### 每次嘗試前

`beforeConnect` 可設定在 client 或單次 execution。首次 attempt 與每次 reconnect 時，都會在 native constructor 前執行：

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

此時 command input 與 request projection 已經建好。Hook 不會重新執行 `build`，亦不能修改 bound query value。它適合做應用程式擁有的準備工作，例如 refresh 環境 handshake mechanism 會讀取的 state。Throw 或 rejection 是 terminal transport failure，不會交給處理 close outcome 的 reconnect predicate。

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

`shouldReconnect` 必須同步且不拋錯。Reconnect 會在同一 logical session 建立新實體 socket；incoming 與 outgoing queue 亦屬於該 logical session。

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

正數 `timeoutMs` 到期時，runtime 會向 runtime-error listener 發出 `Error('WebSocket heartbeat timeout')`，並要求 native socket 以 code `4000`、reason `heartbeat timeout` 關閉。要 reconnect，仍要另設允許該 close outcome 的 reconnect policy。

保持 `timeoutMs < intervalMs`。目前實作不會驗證兩者關係；timeout 大於或等於 interval 時，之後的 heartbeat timer 可能重疊。

## Queue

`queue` option 只設定 outgoing message queue：

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

Outgoing queue 預設無上限。設定 bound 後，預設 overflow mode 是 `drop-oldest`；其他選項為 `drop-newest` 與 `error`。Terminal close 會清空 send queue。

Incoming queue 沒有 public bound 或 overflow option。它是無界共用工作隊列，亦沒有 backpressure。資源擁有者必須持續讀取，否則要關閉 session。

## Close Ownership

`session.close(code, reason)` 會呼叫目前 native socket 的 `close` method，並以 manual-close marker abort logical session。它只會 request close，不保證 graceful handshake、可見 `closing` state，也不保證最終 `closed` 值準確 echo request code 與 reason。

`session.closed` resolve 成 runtime 實際 observed 的 close information：

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

如果 native implementation 一直不 emit close event，settlement 可能延後。視乎 normalized reason，external cancellation 最終可能是 `aborted` 或 `error`；session 正在 attempt gap 時，亦可能跳過 `closing`。

請在開啟 session 的 component、route、job 或 service boundary unsubscribe listener 並關閉 session。單靠 provider unmount 不會完成這些工作。

## URL 與 Authentication 安全

HTTP base URL 會轉成 WebSocket scheme：`http:` 變成 `ws:`，`https:` 變成 `wss:`。Path placeholder 不作 segment encoding；query 值使用 configured serializer。

Protocol precedence 依序是 execution option、client option、endpoint definition。明確傳入 empty protocol array 會 suppress 較低 precedence 的值。

Browser WebSocket API 不能設定任意 handshake header。不要把 query parameter 當成通用 credential channel；browser tool、proxy、access log 與 telemetry 都可能記錄 URL。請使用 TLS（`wss:`），並按部署環境審查 authentication design，例如合適的 same-site cookie flow 或 short-lived connection ticket。

## 下一步

- [SSE](/zh-Hant-HK/core/sse)：stream retry 與 queue behavior 的分別。
- [Interceptors](/zh-Hant-HK/core/interceptors)：如何保留 live session getter。
- [Errors](/zh-Hant-HK/core/errors)：startup tuple failure。
