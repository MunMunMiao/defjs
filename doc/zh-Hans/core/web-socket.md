---
title: WebSocket
description: 定义 message envelope，启动并观察 live session，消费 incoming work，配置 opt-in reconnect 与 heartbeat，并关闭自己拥有的资源。
---

# WebSocket

`defineWebSocket(...)` 为使用 JSON message 的 WebSocket endpoint 创建 command builder。

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

每条 message 都是 JSON object，并包含非空 string `type`。Type 从 `incoming` 或 `outgoing` 中选择 Struct。

Object payload 的字段可以与 `type` 同级：

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

Scalar 或 array payload 放进 `data`：

```json
{ "type": "count", "data": 3 }
```

`type` 和 `data` 是保留的 envelope key。如果 object payload 本身有 `data` 字段，请把整个 payload 包进 `data`，否则 runtime 会把该字段误认为 envelope payload：

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

对应的 wire shape 是 `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`。

不要把 `type` 声明成普通 payload 字段。Envelope normalization 会管理它。

可选的 `incoming.default` Struct 处理其他未声明 message type。没有它时，unknown type 会被丢弃。

## 启动 Tuple

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

WebSocket 返回：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功时，第三项是启动 connection 快照。它可以包含第一次物理 socket open 时捕获的 `url`、`protocol` 和 `extensions`。

`session.connection` 是 live getter。重连会替换底层物理 socket，也可能更新该值。需要启动快照时，请保留 tuple 的第三项。

不要记录 connection URL。它可能包含 path identifier、应用 query 数据和 telemetry propagation 字段。

## Live Session

一个 `WebSocketSession` 是一个逻辑 session，可以跨越多次物理连接尝试。

| Member                     | 行为                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `connection`               | 最新 connection 信息的 live getter。                       |
| `state`                    | 逻辑 session state 的 live getter。                        |
| `receive`                  | 已校验 incoming message 的共享 async work queue。          |
| `send(message)`            | 校验、序列化，然后发送或 enqueue outgoing message。        |
| `close(code?, reason?)`    | 请求终止关闭。                                             |
| `closed`                   | 返回已观察到的终止关闭信息的 promise。                     |
| `onStateChange(listener)`  | 添加 state observer，并返回 unsubscribe function。         |
| `onRuntimeError(listener)` | 添加 runtime-error observer，并返回 unsubscribe function。 |

Client 返回 session 后不会继续跟踪它。调用方负责消费、observer、取消和关闭。

## 接收 Message

Text、ArrayBuffer、typed-array 和 Blob message 会按 UTF-8 JSON 解码。以下输入会被静默丢弃：

- 无效 JSON；
- 非 object envelope；
- 缺少 `type`，或 `type` 不是非空 string；
- 没有 `incoming.default` Struct 的 unknown type。

选中 Struct 后，如果解码失败，该错误会传给 `onRuntimeError`，message 随后被丢弃。

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

Incoming iterable 是一个无界共享工作队列。多个 iterator 会竞争 message，不是相互独立的 subscription。Queue 增长时，transport 不会让服务端减速。必须持续消费 incoming message，或尽快关闭 session。

## 发送 Message

`send(...)` 是同步方法。以下情况会同步抛错：

- endpoint 没有 `outgoing` map；
- message 没有合法 `type`；
- type 未声明；
- payload 结构化解码或编码失败；
- 有界 send queue 使用 `overflow: 'error'`；
- 立即发送时，原生 socket 抛错。

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

Open 前或重连间隙发送的 message 会进入 outgoing send queue。物理 socket open 后，queue 会 flush。

不要在 terminal state 后调用 `send`。当前实现没有稳定的 post-close rejection contract，终止关闭后入队的数据也可能永远不会发送。

## State

`session.state` 可以是：

| State          | 含义                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `idle`         | execution 开始前的初始内部状态。                                                                      |
| `connecting`   | 第一次物理连接尝试正在开始。                                                                          |
| `open`         | 物理 socket 打开后最近一次发出的逻辑状态。等待重连时，即使物理 socket 已不存在，它仍可能保持 `open`。 |
| `reconnecting` | delay 结束后，后续物理连接尝试正在开始。                                                              |
| `closing`      | 取消正在关闭 active connecting/open socket。                                                          |
| `closed`       | 没有 normalized error 的终止关闭。                                                                    |
| `aborted`      | 外部取消被归一化为 `ABORTED` 后的 terminal state。                                                    |
| `error`        | 其他 terminal failure。                                                                               |

`reconnecting` 不会在 delay 期间发出，只会在 delay 结束、下一次尝试开始时发出。`session.state` 只是最近一次发出的生命周期状态，不能证明当前一定存在 native socket。这段空档里发送的消息会进入 outgoing queue。

State listener 会被直接调用。确保它不抛错，并在所有者结束时 unsubscribe。

### 每次尝试前

`beforeConnect` 可以配置在 client 或单次 execution 上。初次尝试和每次重连时，它都会在原生 constructor 之前运行：

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

此时 command input 和 request projection 已经构建完成。这个 hook 不会重新运行 `build`，也不能修改已绑定 query value。它适合做应用拥有的准备工作，例如刷新环境 handshake 机制会读取的状态。Throw 或 rejection 是 terminal transport failure，不会传给处理 close outcome 的 reconnect predicate。

## 重连需要显式开启

没有 reconnect object 就不会重连。可以按 client 或单次 execution 配置：

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

`attempts` 表示初次尝试之后的重试次数。传入空对象会启用三次重试，默认值如下：

| 字段              | 默认值                             |
| ----------------- | ---------------------------------- |
| `attempts`        | `3`                                |
| `delayMs`         | `1000`                             |
| `factor`          | `2`                                |
| `maxDelayMs`      | `30000`                            |
| `jitter`          | `0`                                |
| `shouldReconnect` | 对所有 close outcome 返回 `true`。 |

默认 predicate 会重试 clean 和 unclean remote close。如果 clean close 应直接终止，请设置 predicate。第一次重试的 `attempt` 是 1。

Base delay 是 `min(delayMs * factor ** (attempt - 1), maxDelayMs)`。WebSocket jitter 是乘法比例：例如 `0.2` 会在 `0.8` 到 `1.2` 之间随机选择 factor。这与 SSE 额外增加毫秒数的 additive jitter 不同。

确保 `shouldReconnect` 同步且不抛错。Reconnect 会在同一个逻辑 session 中建立新的物理 socket。Incoming 和 outgoing queue 都属于该逻辑 session。

## Heartbeat

Heartbeat 也需要显式开启：

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

`message` 必须产生 endpoint `outgoing` map 接受的值。`isAck` 识别出的 message 会清除 heartbeat timeout，不会加入 `receive`。

正数 `timeoutMs` 到期时，runtime 会向 runtime-error listener 发出 `Error('WebSocket heartbeat timeout')`，并请求原生 close code `4000`，reason 为 `heartbeat timeout`。要重连，仍需单独配置允许该 close outcome 的 reconnect policy。

保持 `timeoutMs < intervalMs`。当前实现不会校验这个关系；timeout 大于等于 interval 时，后续 heartbeat timer 可能重叠。

## Queue

`queue` option 只配置 outgoing message：

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

Outgoing queue 默认无界。设置上限后，默认 overflow mode 是 `drop-oldest`；其他选项是 `drop-newest` 和 `error`。终止关闭会清空 send queue。

Incoming queue 没有公开的上限或 overflow option。它是无界共享工作队列，也不提供 backpressure。资源所有者必须持续消费，或关闭 session。

## 关闭所有权

`session.close(code, reason)` 会调用当前原生 socket 的 `close` method，并用 manual-close marker abort 逻辑 session。它只请求关闭，不保证 graceful handshake、可见的 `closing` state，也不保证最终 `closed` value 精确回显请求的 code 和 reason。

`session.closed` resolve 为 runtime 实际观察到的 close 信息：

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

如果原生实现从不发出 close event，settlement 可能一直延后。根据 normalized reason 不同，外部取消可能最终是 `aborted` 或 `error`；如果 session 正在两次尝试之间，还可能跳过 `closing`。

在打开 session 的 component、route、job 或 service 边界 unsubscribe listener 并关闭 session。只卸载 provider 不会完成这些工作。

## URL 与 Authentication 安全

HTTP base URL 会转换为 WebSocket scheme：`http:` 变成 `ws:`，`https:` 变成 `wss:`。Path placeholder 不做 segment encoding。Query value 使用已配置的 serializer。

Protocol 优先级依次是 execution option、client option、endpoint definition。显式传入空 protocol array 会屏蔽低优先级值。

浏览器 WebSocket API 不能设置任意 handshake header。不要把 query parameter 当成通用 credential channel；browser tool、proxy、access log 和 telemetry 都可能记录 URL。使用 TLS（`wss:`），并针对部署环境审查 authentication 方案，例如合适的 same-site cookie flow 或短期 connection ticket。

## 下一步

- [SSE](/zh-Hans/core/sse)：stream retry 和 queue 行为的区别。
- [Interceptors](/zh-Hans/core/interceptors)：如何保留 live session getter。
- [Errors](/zh-Hans/core/errors)：启动 tuple failure。
