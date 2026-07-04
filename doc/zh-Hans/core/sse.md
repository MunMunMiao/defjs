---
title: SSE
description: 使用 defineEventStream 定义类型化的服务器推送事件端点，并通过客户端消费流式事件。
---

# SSE

Defjs 使用 `defineEventStream` 定义类型化的 SSE（Server-Sent Events）端点。执行后返回三元组 `[error, stream, openInfo]`，其中 `stream` 是异步可迭代对象，用于逐个消费服务器推送的事件。

## 定义事件流

定义 SSE 端点时，声明 `events` 字段，将事件名称映射到结构。SSE 传输层将每个 `data:` 负载作为原始文本投递；Defjs 选择匹配的结构，并按照该结构的内容 kind 解码文本。

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

### 默认事件结构

如果服务器可能发送 `events` 中未显式声明的事件类型，提供 `default` 结构。没有 `default` 时，未知事件会从流中被丢弃；如果配置了 `onInvalidEvent`，仍可在那里通过 `missing-struct` 原因观察到它们。

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### 事件数据内容解码

SSE 传输层将每个 `data:` 负载作为原始文本投递。Defjs 首先从 `events[eventName] ?? events.default` 中选择事件结构，然后按照所选结构解码该文本。

当服务器为事件发送 JSON 文本时，使用 `struct.json(inner)`。`struct.json(inner)` 会先在原始 SSE 文本上执行 `JSON.parse`，再用 `inner` 解析结果值：

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

对于原始文本负载：

- `struct.string()` 与 `struct.text()` 直接读取原始事件文本。
- `struct.number()` 会去除空白，并只接受有限数值。
- `struct.boolean()` 会去除空白，并只接受精确的 `true` 或 `false`。

普通 `struct.object(...)`、`struct.array(...)`、`struct.record(...)` 不会自行解析看起来像 JSON 的文本。对于 JSON 事件数据，请将它们包裹在 `struct.json(...)` 中。

### 带输入的事件流

当流需要路径参数、查询参数或请求头时，提供 `input` 结构。如果该输入使用 `struct.request({ path, query, headers })`，Defjs 会自动映射这些区段。仅当公开输入形状与实际传输形状不同时，才添加 `build`。

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

SSE 的 `build` 只支持映射 path、query 和 headers 这些请求部分。凭证应在客户端级别通过 `withCredentials(...)` 配置；`build(ctx, input)` 不暴露公开的凭证设置方法。SSE 也不支持通过 `build` 公开设置请求体。

## 执行结果

`client.execute()` 为 SSE 命令返回三元组：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — 仅在连接或启动失败，或 `client.execute()` 启动阶段的请求输入校验失败时非空；成功打开流时为 `null`。事件级的 `validation-failed` / `missing-struct` 不会填充这里的 `error`，而是交给 `onInvalidEvent`，问题事件可被丢弃且流继续运行。
- **`stream`** — 成功时，为可通过 `for await...of` 消费的 `EventStreamHandle`；启动失败时为 `undefined`。
- **`open`** — `client.execute()` 启动成功时返回的启动打开快照，包含当次启动连接通过校验后的响应信息（`response` 和 `url`）。如果后续发生重连，请读取 `stream.open` 获取句柄上记录的最新 open 响应/最新连接尝试响应快照；它会在收到响应后立刻更新，因此不保证该响应已经通过后续校验或代表成功连接，HTTP 4xx/5xx 或无效 `content-type` 的重连响应也可能覆盖它。如果你需要保留启动时的打开快照，请单独保存这里的三元组第三项。连接失败或启动前校验失败时可能为 `undefined`。

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle 和 stream.closed

`EventStreamHandle` 实现 `AsyncIterable`，因此可以直接与 `for await...of` 一起使用。它还提供以下属性。注意：这里的 `stream.open` 是句柄上的活动状态，会在每次收到新的 open 响应后更新；它表示最新 open 响应/最新连接尝试响应快照，不保证该响应已经通过校验或代表成功连接。`const [error, stream, open] = await client.execute(...)` 中的第三项 `open` 则只是启动完成时拿到的打开快照；如果你需要保留它，请单独保存。

| 属性 / 方法                | 说明                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `open`                     | 最新 open 响应/最新连接尝试响应的 `EventStreamOpenInfo`（包含 `response` 和 `url`）；每次收到新的 open 响应后都会更新，可能来自尚未通过校验的重连响应 |
| `closed`                   | `Promise<EventStreamCloseInfo>`，流完全关闭时解析                                        |
| `close(reason?)`           | 主动关闭流，可选传入原因                                                                 |
| `[Symbol.asyncIterator]()` | 返回消费事件队列的异步迭代器                                                             |

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

当服务器发送的事件无法匹配 `events` 中的任何结构（或 `default`），或结构验证失败时，触发 `onInvalidEvent` 观察者。它是客户端级配置，在 `createClient` 时通过 `withSSEOptions({ onInvalidEvent })` 或 `withSSEOnInvalidEvent(...)` 传入。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: 验证失败时的原始错误
    },
  }),
)
```

`onInvalidEvent` 是一个**观察者**：

- 它接收 `reason: 'missing-struct' | 'validation-failed'` 与原始 `message` 上下文，可用于记录、告警或埋点。
- 问题事件会被丢弃，不会产出到 `stream`；后续合法事件仍可继续消费。
- 即使内部抛出异常，异常也会被静默忽略，不会中断整个流。
- 但如果 `onInvalidEvent` 是异步函数，运行时会在处理该条无效事件时等待它完成，然后再继续后续消息处理；慢处理器会拖慢后续事件到达消费端的速度。
- 因此应让处理器保持轻量；若需要慢日志、上报或其他耗时工作，请在处理器内部自行 fire-and-forget。

将 `struct.object(...)` 直接声明给 `data:` 为 JSON 文本的事件，是常见的验证失败来源。这里应改用 `struct.json(struct.object(...))`。如果 `struct.json(...)` 下的 JSON 本身无效，会按 `validation-failed` 上报，不会退回按原始文本重试。

## 重连和队列配置

SSE 传输内置自动重连，可通过客户端级别的 `withSSEReconnect(...)`、`withSSEQueue(...)` 或 `withSSEOptions(...)` 配置 `reconnect` 和 `queue`。

### 重连配置

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
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
  }),
)
```

重连决策流程：

1. 如果 `shouldReconnect` 返回 `false`，停止重连。
2. 如果超出 `attempts` 限制，停止重连。
3. 否则，使用 `delayMs` + `factor` 指数退避 + `jitter` 计算下一次重试间隔。

> 重连会自动携带 `Last-Event-ID` 请求头，使服务器可以从断点恢复。

### 队列配置

事件到达后进入内部异步队列，然后由迭代器消费。你可以限制队列大小和溢出行为：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | 行为                                 |
| ------------- | ------------------------------------ |
| `drop-newest` | 丢弃新到达的事件，保留队列中的旧事件 |
| `drop-oldest` | 丢弃最旧的事件，为新事件腾出空间     |
| `error`       | 队列满时抛出错误，导致流关闭         |

## 完整示例

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
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
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## 下一步

- [客户端 →](/zh-Hans/core/client) — `createClient` 和 `sse` 选项
- [命令 →](/zh-Hans/core/commands) — 命令定义和输入规则
- [WebSocket →](/zh-Hans/core/web-socket) — WebSocket 连接和状态管理
