---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# 命令

Defjs 围绕“命令”构建：由 `defineRequest`、`defineEventStream` 和 `defineWebSocket` 创建的类型安全可执行对象。每个命令携带 `kind`（传输类型）、`definition`（端点结构）和 `input`（调用数据）。客户端根据 `kind` 分发到正确的传输逻辑。

## defineRequest：HTTP 端点定义

`defineRequest` 定义一个 RESTful HTTP 端点。它接受一个定义对象，并返回一个命令构建器。

```typescript
import { defineRequest } from '@defjs/core'
import { struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  output: [
    { status: 200, body: struct.object({ name: struct.string(), age: struct.number() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### 定义对象字段

| 字段           | 类型                              | 说明                                             |
| -------------- | --------------------------------- | ------------------------------------------------ |
| `method`       | `string`                          | HTTP 方法，例如 `GET`、`POST`                    |
| `path`         | `string`                          | URL 路径，支持 `:param` 占位符                   |
| `input`        | `AnyStruct \| undefined`          | 输入数据 Struct 验证器                           |
| `build`        | `RequestBuildHandler`             | 将解析后的输入映射到 HTTP 请求各部分             |
| `output`       | `RequestOutputShape \| undefined` | 将状态码映射到响应 Struct                        |
| `responseType` | `HttpResponseType`                | 可选，强制响应解析模式（`json`、`text`、`blob`） |

### input / output / build 关系

1. **input**：描述调用方必须提供的数据。执行时，客户端使用 `input` Struct 验证并解析原始输入。
2. **build**：接收 `RequestBuilder` 和解析后的输入 (`RequestBuildInput`)，将数据映射到路径参数、查询参数、请求头和请求体。
3. **output**：描述服务器可能返回的响应。客户端按 HTTP 状态码选择匹配的结构，并推断 2xx 成功类型和非 2xx 错误类型。

如果省略 `build`，则必须同时省略 `input`。该命令不接受输入，直接发送到 `path`。

如果提供 `build`，则必须同时提供 `input`。这是严格的设计规则。

### 无输入快捷方式

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // 无需参数
```

### 输出类型推断

`output` 同时支持数组和对象形式，行为等价：

```typescript
// 数组形式（推荐）
output: [
  { status: 200, body: UserStruct },
  { status: [401, 403], body: AuthErrorStruct },
]

// 对象形式
output: {
  200: UserStruct,
  '401': AuthErrorStruct,
  '403': AuthErrorStruct,
}
```

执行结果自动推断类型：2xx 数据进入成功分支，其余进入错误分支。

---

## defineEventStream：SSE 流定义

`defineEventStream` 定义一个 Server-Sent Events (SSE) 端点。它将事件名称映射到 Struct，实现事件级类型安全。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.object({ text: struct.string() }),
    userJoined: struct.object({ userId: struct.number(), name: struct.string() }),
  },
})

const command = Notifications()
```

### events 映射

`events` 中的每个键对应 SSE 的 `event` 字段。消息到达时，客户端按 `event` 名称查找匹配的结构。

### default 事件处理

如果服务器发送了未声明的事件名，你可以提供 `default` 结构：

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // 未匹配的事件解析为字符串
  },
})
```

没有 `default` 时，未匹配的事件将被丢弃。如果配置了 `onInvalidEvent` 拦截器，它会收到通知。

### 带输入的 SSE

SSE 默认使用 `GET`。如果需要查询参数，提供 `input` 和 `build`，与 `defineRequest` 相同：

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

SSE 的 `build` 不支持请求体或 `withCredentials`。

---

## defineWebSocket：WebSocket 定义

`defineWebSocket` 定义一个 WebSocket 端点，区分 **incoming**（服务器 → 客户端）和 **outgoing**（客户端 → 服务器）消息结构。

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: struct.object({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
    system: struct.object({ event: struct.string() }),
  },
  outgoing: {
    sendMessage: struct.object({ text: struct.string() }),
    joinRoom: struct.object({ roomId: struct.string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### incoming 消息结构

`incoming` 定义服务器推送的消息类型。每条消息必须包含一个 `type` 字段，匹配 `incoming` 中的键。如果负载是对象，其字段会与 `type` 合并：

```typescript
// 服务器发送：{ type: 'message', user: 'Alice', text: 'Hi' }
// 解析为：    { type: 'message', user: 'Alice', text: 'Hi' }
```

如果负载是标量（字符串、数字等），它会被包装为 `{ type: 'xxx', data: <value> }`。

### outgoing 消息结构

`outgoing` 定义客户端发送的消息类型。`type` 自动从键名填充。你只需提供负载：

```typescript
// 发送：{ type: 'sendMessage', text: 'Hello' }
// 或：   { type: 'sendMessage', data: { text: 'Hello' } }
```

如果 outgoing 消息负载是对象，两种形式都支持。如果是标量，必须使用 `{ type: 'xxx', data: <value> }`。

### 只接收的 WebSocket

如果你不需要向服务器发送消息，省略 `outgoing`：

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### WebSocket build 限制

WebSocket 的 `build` 仅支持 `setPathParams` 和 `setQueryParams`。不支持 HTTP 专属操作（请求头、请求体）。

---

## 命令对象结构

无论定义类型如何，构建后的命令遵循统一的结构：

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP 命令
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE 命令
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket 命令
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` 是传输类型标签。`Client.execute` 根据它分发到相应的执行器（HTTP fetch、SSE 流、WebSocket 连接）。

---

## 输入可选规则（IsInputOptional）

命令构建器的参数是否可选由 `IsInputOptional` 自动推断：

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

规则：

1. **未定义 `input`**：`TInput` 为 `undefined`，参数完全可选。
2. **有 `input` 但所有字段可选**：`{} extends EndpointInput<...>` 为 true，参数仍然可选。
3. **有 `input` 且包含必填字段**：参数必填。

```typescript
// 无 input — 可选
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// 所有字段可选 — 可选
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: struct.object({
    query: struct.object({ q: struct.string().optional() }),
  }),
  build(ctx, input) {
    ctx.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// 必填字段 — 必填
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: struct.object({
    body: struct.object({ name: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setJson(input.body)
  },
})
C() // TypeScript 错误：缺少参数
C({ body: { name: 'defjs' } }) // OK
```

## 下一步

- [SSE →](/core/sse) — SSE 执行、重连和事件处理
- [WebSocket →](/core/web-socket) — WebSocket 连接、心跳和状态管理
- [客户端 →](/core/client) — 客户端创建和 `execute` 用法
