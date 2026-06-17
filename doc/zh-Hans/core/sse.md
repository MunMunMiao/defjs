---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs 使用 `defineEventStream` 定义类型化的 SSE（Server-Sent Events）端点。执行后返回三元组 `[error, stream, openInfo]`，其中 `stream` 是异步可迭代对象，用于逐个消费服务器推送的事件。

## 定义事件流

定义 SSE 端点时，声明 `events` 字段，将事件名称映射到结构。每种事件类型的 `data` 字段会自动按匹配的结构解析。

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.number(),
      text: struct.string(),
    }),
    heartbeat: struct.string(),
  },
})
```

### 默认事件结构（回退）

如果服务器可能发送 `events` 中未显式声明的事件类型，提供 `default` 结构作为回退。没有 `default` 时，未知事件会被静默丢弃。

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### 带输入的事件流

当流需要查询参数或请求体时，提供 `input` 结构和 `build` 函数。`build` 签名与 `defineRequest` 相同，支持 params、query 和 headers。

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: {
    chat: struct.object({ user: struct.string(), text: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ roomId: '42' }))
```

## 执行结果

`client.execute()` 为 SSE 命令返回三元组：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — 连接或验证失败时非空；成功时为 `null`。
- **`stream`** — 成功时，为可通过 `for await...of` 消费的 `EventStreamHandle`；失败时为 `undefined`。
- **`open`** — 包含首次连接响应信息（`response` 和 `url`）。连接失败时可能为 `undefined`。

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message') {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle 和 stream.closed

`EventStreamHandle` 实现 `AsyncIterable`，因此可以直接与 `for await...of` 一起使用。它还提供以下属性：

| 属性 / 方法                | 说明                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `open`                     | 首次连接 `EventStreamOpenInfo`（包含 `response` 和 `url`） |
| `closed`                   | `Promise<EventStreamCloseInfo>`，流完全关闭时解析          |
| `close(reason?)`           | 主动关闭流，可选传入原因                                   |
| `[Symbol.asyncIterator]()` | 返回消费事件队列的异步迭代器                               |

`closed` 在以下情况下解析：

- 服务器正常结束（`code: 'eof'`）
- 通过 `stream.close()` 主动关闭（`code: 'aborted'`）
- 连接错误或重连耗尽（`code: 'error'`）

```typescript
// 主动关闭
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## 无效事件处理：onInvalidEvent

当服务器发送的事件无法匹配 `events` 中的任何结构（或 `default`），或结构验证失败时，触发 `onInvalidEvent` 观察者。它是客户端级配置，在 `createClient` 时通过 `sse.onInvalidEvent` 传入。

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-schema' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: 验证失败时的原始错误
    },
  },
})
```

`onInvalidEvent` 是一个**观察者**：

- 即使内部抛出异常，异常会被静默忽略，流继续运行。
- 它不会阻塞后续事件的消费。

## 重连和队列配置

SSE 传输内置自动重连，可通过客户端级别的 `sse.reconnect` 和 `sse.queue` 配置。

### 重连配置

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: {
      attempts: 5, // 最大重试次数
      delayMs: 1000, // 初始重试间隔
      factor: 2, // 指数退避乘数
      maxDelayMs: 30000, // 最大重试间隔
      jitter: 1000, // 随机抖动范围（毫秒）
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  },
})
```

重连优先级：

1. 如果 `onerror` 返回 `null`，停止重连。
2. 如果 `shouldReconnect` 返回 `false`，停止重连。
3. 如果超出 `attempts` 限制，停止重连。
4. 否则，使用 `delayMs` + `factor` 指数退避 + `jitter` 计算下一次重试间隔。

> 重连会自动携带 `Last-Event-ID` 请求头，使服务器可以从断点恢复。

### 队列配置

事件到达后进入内部异步队列，然后由迭代器消费。你可以限制队列大小和溢出行为：

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  },
})
```

| `overflow`    | 行为                                 |
| ------------- | ------------------------------------ |
| `drop-newest` | 丢弃新到达的事件，保留队列中的旧事件 |
| `drop-oldest` | 丢弃最旧的事件，为新事件腾出空间     |
| `error`       | 队列满时抛出错误，导致流关闭         |

## 完整示例

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  },
})

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.object({ level: struct.string(), msg: struct.string() }),
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
    console.log(`[${event.data.level}] ${event.data.msg}`)
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## 下一步

- [客户端 →](/core/client) — `createClient` 和 `sse` 选项
- [命令 →](/core/commands) — 命令定义和输入规则
- [WebSocket →](/core/web-socket) — WebSocket 连接和状态管理
