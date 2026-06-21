---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` 通过 `defineWebSocket` 提供类型化的 WebSocket 端点。每个端点声明：

- `incoming` 结构 — 服务器发送给客户端的消息。
- `outgoing` 结构 — 客户端发送给服务器的消息。
- `input` 结构 + `build` 处理器 — 请求参数和查询/路径构造（可选）。

消息采用 JSON 编码，并在运行时针对声明的结构进行验证。

## 定义 WebSocket 端点

使用 `defineWebSocket` 创建类型化的命令构建器。然后通过 `client.execute()` 执行。

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // 可选：从输入构建连接 URL
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // 服务器 → 客户端的消息
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // 客户端 → 服务器的消息
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### 结构形状

**入站消息**以 `type` 为键。消息到达时，其 JSON `type` 字段与结构键匹配。如果负载是普通对象，其字段会与 `type` 合并：

```typescript
// 服务器发送：{ "type": "message", "text": "hi", "userId": 1 }
// 客户端接收：{ type: 'message', text: 'hi', userId: 1 }
```

如果负载是标量或数组，它会被包装到 `data` 下：

```typescript
// 服务器发送：{ "type": "notification", "data": [1, 2, 3] }
// 客户端接收：{ type: 'notification', data: [1, 2, 3] }
```

**出站消息**遵循相同约定。`send()` 方法接受一条 `type` 匹配 `outgoing` 键的消息：

```typescript
socket.send({ type: 'message', text: 'hello' })
```

`incoming` 中可以使用特殊的 `default` 键，用共享结构捕获未声明的消息类型。

## 执行和消费消息

`client.execute()` 返回元组 `[error, socket, connection]`：

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // 处理启动失败（验证、传输、中止等）
  return
}

// 迭代入站消息
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

// 或者直接使用异步迭代器
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## `WebSocketSession` API

| 成员                       | 类型                                       | 说明                                                             |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | 来自底层套接字的 `{ url?, protocol?, extensions? }`。            |
| `state`                    | `WebSocketState`                           | 当前生命周期状态（见下文）。                                     |
| `receive`                  | `AsyncIterable<TIncoming>`                 | 验证后的入站消息异步迭代器。                                     |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | 套接字关闭时解析，返回 `{ code?, reason?, wasClean?, cause? }`。 |
| `send(message)`            | `(message: TOutgoing) => void`             | 发送出站消息。未打开时排队。                                     |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | 优雅地关闭连接。                                                 |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | 返回取消订阅函数。                                               |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | 返回取消订阅函数。                                               |

```typescript
// 状态监控
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// 运行时错误（结构失败、心跳超时等）
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// 优雅关闭
socket.close(1000, 'done')
await socket.closed
```

## 连接生命周期状态机

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| 状态           | 含义                                                 |
| -------------- | ---------------------------------------------------- |
| `idle`         | 在 `execute()` 被调用之前。                          |
| `connecting`   | 首次打开连接尝试中。                                 |
| `open`         | 连接已建立，消息可以流动。                           |
| `closing`      | `close()` 或 `abort` 被触发，等待关闭事件。          |
| `closed`       | 干净关闭（无错误，或手动关闭）。                     |
| `reconnecting` | 连接断开，等待重试。                                 |
| `error`        | 终端失败（验证错误、传输错误、非中止关闭且带原因）。 |
| `aborted`      | 通过 `AbortSignal` 或 `close()` 显式中止。           |

状态转换通过 `onStateChange` 发出。`receive` 异步迭代器在套接字到达终端状态（`closed`、`error` 或 `aborted`）时结束。

## 心跳

配置周期性 ping/ack 以保持连接活跃，或检测死连接。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // 每 30 秒发送
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // 期望 10 秒内收到 ack
    isAck: (message) => message.type === 'pong',
  },
})
```

| 选项         | 说明                                                       |
| ------------ | ---------------------------------------------------------- |
| `intervalMs` | 心跳发送间隔（必填）。                                     |
| `message`    | 返回心跳消息的工厂。类型与 `TOutgoing` 对应。              |
| `timeoutMs`  | 如果设置，当未及时收到 ack 时，套接字以 code `4000` 关闭。 |
| `isAck`      | 判断入站消息是否为心跳响应的谓词。                         |

心跳可以在客户端级别配置（通过 `createClient({ webSocket: { heartbeat: ... } })`）或在请求级别配置（通过 `execute()` 选项）。请求级别配置优先。

## 重连

连接意外断开时触发自动重连。

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

| 选项              | 默认值       | 说明                               |
| ----------------- | ------------ | ---------------------------------- |
| `attempts`        | `3`          | 最大重试次数。`<= 0` 禁用重连。    |
| `delayMs`         | `1000`       | 首次重试前的基准延迟。             |
| `factor`          | `2`          | 指数退避乘数。                     |
| `maxDelayMs`      | `30000`      | 计算延迟的上限。                   |
| `jitter`          | `0`          | 随机化因子（`0`–`1`）。            |
| `shouldReconnect` | `() => true` | 判断给定关闭是否应触发重试的谓词。 |

延迟公式：`min(delayMs * factor^(attempt - 1), maxDelayMs)`，然后加上抖动。

重连也可在客户端级别通过 `createClient({ webSocket: { reconnect: ... } })` 配置。

## 发送队列

在套接字处于 `open` 之前（或临时断开期间）发送的消息会被排队，连接就绪后批量发送。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| 选项       | 说明                         |
| ---------- | ---------------------------- |
| `maxSize`  | 最大排队消息数。默认无限制。 |
| `overflow` | 超出 `maxSize` 时的行为。    |

队列在终端关闭（`error`、`aborted`、`closed`）时清空。

## 手动关闭和中止行为

### `socket.close(code?, reason?)`

执行优雅关闭：

1. 调用原生 `WebSocket.close(code, reason)`。
2. 以 `manual-web-socket-close` 原因中止内部 `AbortController`。
3. 套接字经过 `closing` → `closed` 转换。
4. `socket.closed` 解析为提供的 `code` 和 `reason`。

### `AbortSignal`（外部）

通过 `execute()` 选项传入外部 `AbortSignal`：

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// 稍后：
controller.abort() // 立即关闭套接字并转换为 'aborted'
```

在套接字打开**之前**中止，`execute()` 解析为传输错误且 `socket` 为 `undefined`。在打开**之后**中止，套接字转换为 `aborted` 且 `receive` 结束。

### `timeout`

支持请求级超时，但不能与同一请求上的 `abort` 同时使用（会返回定义错误）：

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// 错误 —— 不能混用 abort 和 timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## 完整示例

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

## 下一步

- [SSE →](/core/sse) — 带类型化结构和重连的服务器推送事件。
- [客户端 →](/core/client) — 客户端创建和 WebSocket 配置。
- [命令 →](/core/commands) — `defineWebSocket` 输入和构建规则。
