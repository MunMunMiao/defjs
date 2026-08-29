---
title: WebSocket
description: 启动类型化 JSON 会话，收发信封，再 close 并 await closed。
---

# WebSocket

启动 → 收 → 发 → 用 `await using` 释放。退订和 disposal 归你。手动 `close()` / `closed` 仍可使用；Client、provider、interceptor 不会自动关闭 session。

## 基本用法

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, session, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using ownedSession = session
  const unsubscribe = ownedSession.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    ownedSession.send({ type: 'send', text: 'Hello' })
    for await (const message of ownedSession.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## JSON 信封

`defineWebSocket(...)` 描述 JSON 消息端点。必填的 `incoming` 映射按消息类型选 Struct；可选的 `outgoing` 给 `session.send(...)` 同样做。每条线上消息都是带非空字符串 `type` 的对象。

对象 payload 字段和 `type` 并列。标量和数组 payload 用信封的 `data` 字段：

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

消息映射管的是 payload，不是信封 discriminator。`incoming.default` 接受否则未声明的类型名；没有它时未知类型会丢掉。入站文本、`ArrayBuffer`、typed-array、`Blob` 帧按 UTF-8 JSON 解码。坏 JSON 和 Struct 失败走运行时错误 observer——不进 `receive`。

对象 payload 若有名为 `data` 的字段，编码后仍和 `type` 并列（不是嵌套信封）。例如：`write` 配 `{ data: string, source: string }` 线上是 `{ type: 'write', data: string, source: string }`。调用方值仍是 `{ type: 'write', data: { data, source } }`，因为序列化前 `data` 承载对象 payload。Alias 作用于 payload 字段。`type` discriminator 属于信封，不属于 Struct。

`session.send(...)` 同步校验并序列化。open 时立刻发；`reconnecting` 且启用了出站队列时入队；不可写时抛 `InvalidStateError`。没有 outgoing 映射、未声明类型、payload 校验失败、出站队列禁用/满、或原生 send 失败也会抛。

`receive` 是单消费者。第二个 iterator 会被拒绝。

## 状态快照

| 成员                       | 含义                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `state`                    | `idle`、`connecting`、`open`、`reconnecting`、`closing`、`closed`、`aborted` 或 `error` |
| `connection`               | 最近物理连接：`generation`、URL、协商协议、可用时的 extensions                          |
| `bufferedAmount`           | 原生未发送字节数；没有物理 socket 时是 `0`                                              |
| `receive`                  | 已校验入站消息的单消费者 async iterable                                                 |
| `onStateChange(listener)`  | 订阅逻辑状态迁移；返回退订                                                              |
| `onRuntimeError(listener)` | 订阅非启动运行时错误；返回退订                                                          |
| `closed`                   | 逻辑终端关闭结果的 promise                                                              |

`open` = 物理 socket 已开。`reconnecting` 包含替换前的准备 + 延迟。每有一个物理 socket 到达 `open`，`connection.generation` 加一。Tuple 的 `startupConnection` 留着第一次成功快照；`session.connection` 往前走。

启动失败 → `[error, undefined, connection?]`。打开前构造失败可能没有 connection；启动期间超时/关闭仍可能有快照。Session 返回后，运行时错误走 observer、`receive`、`closed`——不是第二次 execute tuple。

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## 重连

重连是可选的。没有 `reconnect` 对象 → 物理关闭结束逻辑会话。配置后默认是 `attempts: 3`、`delayMs: 1000`、`factor: 2`、`maxDelayMs: 30000`、`jitter: 0`。`attempts` 计首次之后的重试；`attempts: 0` 关掉。默认谓词接受一切关闭结果。

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` 拿到下次重试 attempt、关闭 cause、code、reason、`wasClean`。手动 `session.close(...)` 不进谓词。准备/政策抛错会以错误结束逻辑会话。

WebSocket 退避 jitter 是**乘性**的（`jitter: 0.2` → 延迟在 `0.8x` 到 `1.2x`）。SSE jitter 与 WebSocket 相同，是 0–1 乘性因子。Delay/factor/jitter/attempt 值在构造前校验；定时器延迟不能超过 `2_147_483_647` ms。

`beforeConnect({ attempt, signal })` 在首次构造和每次重连前跑。把 signal 传进 token 刷新，取消才能同时停准备和连接。

## Heartbeat

在 execute 或 Client 作用域可选开启。按间隔通过 outgoing Struct 映射发 `message()`。可选 `isAck(message)` 识别 ack——该消息清超时，且**不**投递给 `receive`。

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` 和 `timeoutMs` 必须是正有限定时器且 ≤ `2_147_483_647`。Heartbeat 消息必须对 outgoing 映射合法。序列化、原生 send、ack 分类、超时失败对逻辑会话是致命的——不会变成普通重连。

## 队列

| 设置                   | 要求值                          | 行为                                                                                  |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | 正 safe integer                 | 限制等着 `receive` 的已解析消息，以及等着 transform 的原始帧。溢出 → `state: 'error'` |
| `maxOutgoingQueueSize` | 可选非负 safe integer；默认 `0` | 仅在 `state === 'reconnecting'` 时 FIFO。满/禁用 → `send(...)` 抛错                   |

排队的出站帧会在替换 socket 发布 `open` 前刷出。已在更早 socket 上发出的帧不会自动重放。重连队列给的是重连期间你发出的消息——不是重建应用状态。

入站溢出会清掉待处理序列、弄挂 `receive`、停会话，并以 `kind: 'error'` resolve `session.closed`。消费者要够快，或按测到的大小/内存提高上限。

## 协议与鉴权

Definition 的 `protocols`、Client 的 `withWebSocketProtocols(...)`、execute 的 `protocols` 设构造子协议列表。优先级：execution → client → definition。第一个定义的列表会拷给逻辑会话，重连时复用。

浏览器 WebSocket 构造不能塞任意握手 headers。Defjs 把 `http:` → `ws:`、`https:` → `wss:`，path 占位符编码一次，用配置的 query serializer。WebSocket query 构建还会把复杂 query 值序列成 JSON（不像默认 HTTP 只收标量）。

`withCredentials(true)` 是 HTTP/SSE 的 Fetch credentials——不是 WebSocket 鉴权。用审过的 cookie/会话政策、子协议或短命连接 ticket。别把通用凭证或长寿命密钥放进 query。

## 关闭与所有权

`session.close(code?, reason?)` 请求终端关闭并停 heartbeat。Code 必须是 `1000` 或 `3000..4999`；reason ≤ 123 UTF-8 字节。非法 close 参数在改状态前就抛。需要手动 close reason 或逻辑终止结果时，配合 `await session.closed` 使用。

```typescript twoslash
import type { WebSocketSession } from '@defjs/core'

async function observeSession(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  console.log(ownedSession.state)
}

void observeSession
```

`session.closed` 是逻辑终止快照：`'closed'`、`'aborted'` 或 `'error'`，可带原生 `code` / `reason` / `wasClean`，以及 aborted/error 的 `cause`。观察到的原生关闭字段优先于所有者请求的回退。

标准 async disposer 会请求尽力而为的原生 close，再等待 Defjs 自有 lifecycle、消息泵、计时器、监听器、队列和 socket 引用完成 teardown。若 1 秒内始终没有观察到 close event，逻辑 cleanup 会被强制完成，`closed` 以手动 `kind: 'closed'` settle，但 disposer 会用名为 `TimeoutError` 的 `DOMException` reject。若原生 close 调用本身抛错，cleanup 完成后 disposer 会用该错误 reject。重复调用 disposer 会共享同一 teardown。这些结果都无法证明物理 TCP 连接已经关闭。

结构化实现 session 的代码现在必须提供同一份 `[Symbol.asyncDispose](): PromiseLike<void>` 契约。对实现者而言，这是编译期 breaking change；只接收 Defjs session 的消费者无需新增运行时调用。

## GraphQL 边界

Defjs 提供类型化 JSON 信封和逻辑会话生命周期。它**不**实现 WebSocket 应用协议。GraphQL-over-WebSocket 的特性——连接 init、operation ID、`next`/`error`/`complete`、释放、订阅重放——都在核心契约之外。

服务端要求那套协议时用像 `graphql-ws` 这样的协议客户端，或用 `defineWebSocket(...)` 自己建模信封。单靠消息映射谈不成 GraphQL 语义。

## 相关配方

- [打开 WebSocket 会话](../recipes/websocket-session.md)
- [消费 SSE 流](../recipes/consume-sse.md)
