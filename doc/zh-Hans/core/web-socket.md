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

对应的 wire shape 是 `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`。

不要把 `type` 声明成普通 payload 字段。Envelope normalization 会管理它。

可选的 `incoming.default` Struct 处理其他未声明 message type。没有它时，unknown type 会被丢弃。

## 启动 Tuple

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

HTTP、SSE 和 WebSocket execution 的 `timeout` 必须是 `1..2_147_483_647` 范围内的正安全整数；`0`、负数、小数、`NaN`、`Infinity` 或超上限值会在创建 request、stream 或 socket 资源前返回 `REQUEST_VALIDATION_FAILED`。

WebSocket 返回：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功时，第三项是 `generation: 1` 的启动 connection 快照。它可以包含第一次物理 socket 的 `url`、`protocol` 和 `extensions`。

`session.connection` 是 live getter；每次物理 socket 成功 open 都会递增 `generation`。需要启动快照时，请保留 tuple 的第三项。

不要记录 connection URL。它可能包含 path identifier、应用 query 数据和 telemetry propagation 字段。

## 失败诊断

使用 browser WebSocket API，或仅暴露标准 WebSocket event surface 的注入 constructor 时，transport-level handshake failure 通常只能提供稳定的 `RequestError` `kind: 'transport'`，以及 `NETWORK_ERROR`、`ABORTED` 或 `TIMEOUT` 等 `code`。不能承诺拿到 HTTP `401`、其他 handshake status、response header/body，或 Node 特有的 `unexpected-response` 细节。runtime-specific constructor 可以在自己的 adapter 边界暴露更多信息，但那不是可移植的 Core contract。

启动成功后，应等待 `session.closed`，优先使用其中的 `kind`、可选 close `code` 和可选 `wasClean` 作为终止诊断。Close code 是 WebSocket close code，不是 HTTP status。Routine log 只保留经过审查的低基数 context 和这些字段；不要记录 connection URL、query、ticket、原始 `cause` 或 `reason`。只有存在明确的脱敏、访问和保留策略时才扩展记录。

## Live Session

一个 `WebSocketSession` 是一个逻辑 session，可以跨越多次物理连接尝试。

| Member                     | 行为                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `connection`               | 最新 connection 信息的 live getter。                       |
| `bufferedAmount`           | 原生 socket 尚未发送的 byte 数；没有 socket 时为 `0`。     |
| `state`                    | 逻辑 session state 的 live getter。                        |
| `receive`                  | 已校验 incoming message 的共享 async work queue。          |
| `send(message)`            | 先检查可写性，再校验、序列化、发送或 enqueue。             |
| `close(code?, reason?)`    | 请求终止关闭。                                             |
| `closed`                   | 返回已观察到的终止关闭信息的 promise。                     |
| `onStateChange(listener)`  | 添加 state observer，并返回 unsubscribe function。         |
| `onRuntimeError(listener)` | 添加 runtime-error observer，并返回 unsubscribe function。 |

Client 返回 session 后不会继续跟踪它。调用方负责消费、observer、取消和关闭。

## 接收 Message

Text、ArrayBuffer、typed-array 和 Blob message 会按到达顺序解码为 UTF-8 JSON。以下输入会被静默丢弃：

- 非 object envelope；
- 缺少 `type`，或 `type` 不是非空 string；
- 没有 `incoming.default` Struct 的 unknown type。

无效 JSON 和已选 Struct 的校验失败会传给 `onRuntimeError`；frame 会被丢弃，session 继续运行。

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

`receive` 只允许一个 iterator。`maxIncomingQueueSize` 是必填的正 item 上限；overflow 会清空缓冲、让 iterator 失败，并以 `error` 终止 session。

## 发送 Message

`send(...)` 是同步方法。以下情况会同步抛错：

- endpoint 没有 `outgoing` map；
- message 没有合法 `type`；
- type 未声明；
- payload 结构化解码或编码失败；
- reconnecting 时 endpoint-owned outgoing queue 被禁用或已满；
- 立即发送时，原生 socket 抛错。

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

逻辑可写性会在 payload 校验和序列化前检查。只有逻辑 state 与当前物理 socket 都是 `open` 才会直接发送；只有 `reconnecting` 且 endpoint 的 `maxOutgoingQueueSize` 为正数时才会入队。保留的 FIFO 会在 replacement socket 发布 `open` 前 flush。

Manual closing、terminal state，以及 remote close 后 reconnect predicate 尚未决定的窗口都会让 `send` 抛出 `InvalidStateError`。Transport 不会 replay 已经发送到先前物理 socket 的 frame。

## State

`session.state` 可以是：

| State          | 含义                                               |
| -------------- | -------------------------------------------------- |
| `idle`         | execution 开始前的初始内部状态。                   |
| `connecting`   | 第一次物理连接尝试正在开始。                       |
| `open`         | 当前物理 socket 已打开。                           |
| `reconnecting` | 后续物理连接尝试正在准备或 delay。                 |
| `closing`      | 所有者请求 manual close。                          |
| `closed`       | 没有 normalized error 的终止关闭。                 |
| `aborted`      | 外部取消被归一化为 `ABORTED` 后的 terminal state。 |
| `error`        | 其他 terminal failure。                            |

`session.state` 是逻辑生命周期，不是当前一定存在 native socket 的证明。`reconnecting` 期间，`send` 使用 endpoint-owned outgoing capacity。

Observer failure 会被隔离：state-listener failure 会通知 runtime-error listener；runtime-error listener failure 会转发给可用的 `globalThis.reportError`。Terminal settlement 会释放 observer，所有者更早结束时仍应 unsubscribe。

### 每次尝试前

`beforeConnect` 可以配置在 client 或单次 execution 上。初次尝试和每次重连时，它都会在原生 constructor 之前运行：

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

Hook 接收 `{ attempt, signal }`；初次 `attempt` 为 `0`，重连时递增。把 `signal` 传给 owned async work。Abort 和 timeout 会与 hook race、消费 late rejection，并阻止 late result 创建 socket。Throw 或 rejection 是 terminal transport failure。

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

`shouldReconnect` 必须同步；throw 会让 session 以 `error` 终止，明确返回 `false` 会以 `closed` 终止。Reconnect 只建立同一逻辑 session 的新物理 socket，不会 replay 先前 send。应用可在 `session.connection.generation` 增加时只恢复仍 active、可安全 replay 的 subscription，绝不能用它 replay mutation。

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

Heartbeat serialization、send、ack predicate 和 timeout failure 都是 fatal：它们会通知 runtime-error listener、让 `receive` 失败，并使 session 以 `error` 终止，不会咨询 reconnect policy。

`intervalMs` 与已定义的 `timeoutMs` 都必须是正有限值，且不超过 `2_147_483_647`。一个 ack deadline 生效期间，后续 interval 不会发送新 ping 或重置 deadline；ack 或 session stop 会清除它。

## Queue

Queue limit 归 endpoint definition 所有。`maxIncomingQueueSize` 是必填的正 safe integer；overflow 会清空缓冲并以 fatal error 终止。`maxOutgoingQueueSize` 是可选的非负 safe integer，默认 `0`；正数容量会在连接尝试之间按 FIFO 保留 frame，overflow 会拒绝新 frame，而不会删除旧 frame。

两个 limit 都按 item 而非 byte 计数。`session.bufferedAmount` 单独暴露原生 socket 尚未发送的 byte。`receive` 只允许一个 iterator。

## 关闭所有权

`session.close(code, reason)` 会先校验 code 必须是 `1000` 或 `3000..4999`，reason 最多 123 个 UTF-8 byte。合法输入进入 `closing`、请求原生 close，并等待实际 `CloseEvent`；实际观察到的 code/reason 优先于请求值。

`session.closed` resolve 为 runtime 实际观察到的 close 信息：

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

Manual close、无 cause 的 remote close 和明确拒绝重连都会产生 `closed`。外部 abort 产生 `aborted`；timeout 与 runtime failure 产生 `error`。原生 close 抛错时只做一次无参数 fallback；两次都抛错时直接以 `error` settle，不会第三次调用 close。

在打开 session 的 component、route、job 或 service 边界 unsubscribe listener 并关闭 session。只卸载 provider 不会完成这些工作。

## URL 与 Authentication 安全

HTTP base URL 会转换为 WebSocket scheme：`http:` 变成 `ws:`，`https:` 变成 `wss:`。请提供 raw path-placeholder value；Core 会逐 segment 精确编码一次，`%` 会变为 `%25`，并拒绝空值、`.` 和 `..`。Query value 使用已配置的 serializer。

Protocol 优先级依次是 execution option、client option、endpoint definition。显式传入空 protocol array 会屏蔽低优先级值。

浏览器 WebSocket API 不能设置任意 handshake header。不要把 query parameter 当成通用 credential channel；browser tool、proxy、access log 和 telemetry 都可能记录 URL。使用 TLS（`wss:`），并针对部署环境审查 authentication 方案，例如合适的 same-site cookie flow 或短期 connection ticket。

## 下一步

- [SSE](/zh-Hans/core/sse)：stream retry 和 queue 行为的区别。
- [Interceptors](/zh-Hans/core/interceptors)：如何保留 live session getter。
- [Errors](/zh-Hans/core/errors)：启动 tuple failure。
