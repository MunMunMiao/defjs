---
title: SSE
description: 定义并解码有界 Server-Sent Events，配置重连，并关闭自己拥有的 stream。
---

# SSE

`defineEventStream(...)` 创建 SSE command builder。Endpoint 声明 path，以及每个 event name 对应的 Struct。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
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

Method 默认是 `GET`。Endpoint 可以指定其他 method，但高层 SSE build context 不支持 request body。

## Event 解码

SSE parser 先选择 `events[eventName]`，没有时再选择 `events.default`。两者都不匹配时，它会丢弃 event，并向可选 invalid-event observer 报告 `missing-struct`。

SSE `data:` 以 text 到达：

- `struct.string()`、`struct.text()`、`struct.any()` 和 `struct.unknown()` 接收 text；
- `struct.number()` 会 trim text，并接受 finite number；
- `struct.boolean()` 会 trim text，并且只接受 `true` 或 `false`；
- `struct.json(inner)` 先解析 JSON text，再用 `inner` 做结构化解码。

裸 `struct.object(...)` 不会解析看起来像 JSON 的 event text。必须用 `struct.json(...)` 包裹。

`default` Struct 处理其他未声明名称：

```typescript
const events = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

没有 `default` Struct 时，`EventStreamData<TEvents>` 是由已声明的 event name 组成的 discriminated union。按 `event.event` 分支会将 `event.data` 缩窄为对应 Struct 的 output 类型。存在 `default` 时，它的分支会将实际 wire name 保留为 `event: string`；因此，混合已知 event 与 `default` 的 stream 仍会保留这一宽泛的 fallback 分支。

## Input 与 Request 映射

Path、query 和 header section 使用 `struct.request(...)`：

```typescript
const roomEvents = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

自定义 SSE `build` 可以设置 path parameter、query parameter 和 header。它接收 schema-bound projection，不能设置 body 或 credentials。Credentials 要在 client 上用 `withCredentials(...)` 配置。

## 启动 Tuple

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

HTTP、SSE 和 WebSocket execution 的 `timeout` 必须是 `1..2_147_483_647` 范围内的正安全整数；`0`、负数、小数、`NaN`、`Infinity` 或超上限值会在创建 request、stream 或 socket 资源前返回 `REQUEST_VALIDATION_FAILED`。

SSE 返回：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

成功时，第三项是已通过校验的启动 open 快照。它的 response 已通过 HTTP status 和 `text/event-stream` content-type 检查。

`stream.open` 是 live getter，保存逻辑 stream 最近看到的 response。这也可能是后续重连中，最终没有通过 status 或 content-type 校验的 response。需要初次快照时，请单独保存 `startupOpen`。

默认不要记录 `startupOpen.url`、`stream.open.url` 或 response URL。它们可能包含敏感 path 或 query 数据。

## 消费 Event

所有者应在同一个生命周期内开始迭代并安排关闭：

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    await stream.closed
  }
}
```

`execute` 成功只表示启动完成。启动后的错误会通过 iterator rejection 和 `stream.closed` 出现，不会回头修改原始 tuple 的 `error` 项。

通过 `break`、`return` 或 throw 提前离开 `for await` 循环时，会调用 iterator 的 `return()`。Stream 会自动以 `{ code: 'aborted', reason: 'iterator-return' }` 关闭；await `stream.closed` 即可观察这个终止状态。只有 owner 需要从活动 iteration 外部关闭时，才显式调用 `stream.close(...)`。

## 无效 Event

用 `withSSEOnInvalidEvent(...)` 或 `withSSEOptions(...)` 配置 `onInvalidEvent`：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

Observer 会收到：

- `reason: 'missing-struct' | 'validation-failed'`；
- 原始 event 的 `id`、name 和 data text；
- validation failure 的 `cause`。
- 当前 attempt 的 `signal`。

该 event 会被丢弃，后续合法 event 仍可正常投递。Observer 抛错和 rejected promise 会被隔离；abort 会通过 `signal` 立即打断 pending observer。请保持它足够快，并在记录原始 `id`、`data` 或 `cause` 前脱敏。

## 重连

SSE 内置了针对网络错误和 stream read failure 的重试。正常 EOF 会以 `code: 'eof'` 关闭 stream，不会重连。

默认从 1 秒开始重试，而且没有次数上限。设置 `attempts` 来限制次数：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts` 表示初次尝试之后的重试次数。`attempts: 0` 禁用重试。传给 `shouldReconnect` 的 `attempt` 从第一次重试的 1 开始，并在整个逻辑 stream 中持续累计；物理连接成功不会把它清零。

Delay 从当前 retry interval 开始。服务端可用 SSE `retry:` 字段更新该 interval。`factor` 应用指数增长，`maxDelayMs` 限制 base delay。`jitter` 最后再加上从 0 到配置值之间的随机毫秒数。由于 jitter 在 cap 之后相加，最终 delay 可能超过 `maxDelayMs`，但超出部分小于 `jitter`。

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

Transport 会在后续 attempt 中把最近的 event ID 作为 `Last-Event-ID` 发送。`shouldReconnect` 抛错或 reject 时会停止 retry，并让 pending startup 或 stream 以该 policy error settle。Abort 会通过当前 attempt signal 打断 pending predicate。

HTTP/open validation failure、消息处理 fatal error 和正常 EOF 都不同于可重试的网络/read failure。不要假定每条终止路径都会重连。

## Endpoint 自有资源上限

一个 stream 只允许一个 async iterator consumer；创建第二个 iterator 会抛错。Iterator return（包括提前 `break` 离开 `for await`）会自动以 reason `iterator-return` 关闭 stream。

每个定义都必须提供正安全整数 `maxBufferSize` 和 `maxQueueSize`。前者限制每条 SSE line 和当前 event 的累计 data，后者限制等待 consumer 的已解析 event。Queue overflow 是 fatal error，不会静默丢弃 event。

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

正常 EOF 允许 consumer drain 已 buffer 的 event。Fatal parser、transform 或 overflow error 会清空 buffer、cancel active body、reject iteration，并让 `stream.closed` 以 `code: 'error'` settle。

## 终止关闭

`stream.closed` resolve 为 discriminated union：

```typescript
type EventStreamCloseInfo =
  | { code: 'eof'; reason?: string; cause?: unknown }
  | { code: 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

- `eof` 表示 response body 正常结束；
- `aborted` 包括显式 `stream.close(...)` 或取消路径；
- `error` 表示停止重试或出现终止 stream error；该分支始终包含公开的 `errorCode`。

`EventStreamErrorCode` 有六个稳定值：

| Error code                  | 含义                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `INVALID_RESPONSE`          | Status、content type、response error 或 response body 无效。 |
| `MESSAGE_PROCESSING_FAILED` | Event transform 或 lifecycle callback 失败。                 |
| `PARSER_LIMIT_EXCEEDED`     | 超出 endpoint 自有的 parser buffer limit。                   |
| `QUEUE_OVERFLOW`            | 已解析 event 超出 endpoint 自有的 queue bound。              |
| `TIMEOUT`                   | Transport attempt 达到配置的 timeout。                       |
| `TRANSPORT_ERROR`           | 发生其他终止 network、stream read 或 retry policy failure。  |

`stream.close(reason)` 是幂等的。它会 abort 活动 transport 工作、禁止向 queue 继续 push，并 settle `stream.closed`。Iterator `return()` 会以 reason `iterator-return` 使用同一 close path。

常规日志只应记录 `close.code`，以及 `error` 分支中的 `close.errorCode`。没有明确的脱敏和保留策略时，不要记录 `reason`、`cause`、raw event 或 stream URL。

打开 stream 的应用边界负责关闭它。Client 或框架 provider 不会自动关闭。

## 下一步

- [WebSocket](/zh-Hans/core/web-socket)：双向 session 和 opt-in reconnect。
- [Interceptors](/zh-Hans/core/interceptors)：SSE header 修改和生命周期观察。
- [Errors](/zh-Hans/core/errors)：启动 response 的可用性。
