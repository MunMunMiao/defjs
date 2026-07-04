---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# 命令

Defjs 围绕“命令”构建：由 `defineRequest`、`defineEventStream` 和 `defineWebSocket` 创建的类型安全可执行值。运行时它们会携带端点元数据以及可选的调用输入，`Client.execute` 会使用内部传输元数据完成分发。把命令当作不透明值即可：用户代码应将它们传给 `Client.execute(...)`，而不是依赖公开的传输标签判断或内部反射。

## defineRequest：HTTP 端点定义

`defineRequest` 定义一个 RESTful HTTP 端点。它接受一个定义对象，并返回一个命令构建器。

```typescript
import { defineRequest } from '@defjs/core'
import { struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ name: struct.string(), age: struct.number() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = getUser({ path: { id: 42 } })
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
2. **build**：接收 `RequestBuilder` 和解析后的输入 (`RequestBuildInput`)，将数据映射到路径参数、查询参数、请求头和请求体。当公开输入形状与实际传输形状不同，或者你需要自定义映射逻辑时使用它。
3. **output**：描述服务器可能返回的响应。客户端按 HTTP 状态码选择匹配的结构，并推断 2xx 成功类型和非 2xx 错误类型。

当 `input` 使用 `struct.request({ path, query, headers, body })` 时，运行时可以自动构建请求各部分，此时无需提供 `build`。

如果省略 `input`，则必须同时省略 `build`。该命令不接受输入，直接发送到 `path`。

如果提供 `build`，则必须同时提供 `input`。

### 无输入快捷方式

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // 无需参数
```

### 输出类型推断

`output` 同时支持数组和对象形式，行为等价。

本指南主要使用数组形式，因为它能更明确地表达状态码 / 响应体配对，也便于将多个状态码归到同一组。对象形式依然受支持，适合较紧凑的参考示例。

```typescript
output: [
  { status: 200, body: UserStruct },
  { status: [401, 403], body: AuthErrorStruct },
] as const

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
    message: struct.json(struct.object({ text: struct.string() })),
    userJoined: struct.json(struct.object({ userId: struct.number(), name: struct.string() })),
  },
})

const command = Notifications()
```

### events 映射

`events` 中的每个键对应 SSE 的 `event` 字段。消息到达时，客户端按 `event` 名称查找匹配的结构。

### default 事件处理

如果服务器发送了未声明的事件名，你可以提供 `default` 结构：

```typescript
import { defineEventStream, struct } from '@defjs/core'

const Stream = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(), // 未匹配的事件解析为字符串
  },
})
```

没有 `default` 时，未匹配的事件将被丢弃。如果通过 `withSSEOptions({ onInvalidEvent })` 或 `withSSEOnInvalidEvent(...)` 配置了无效事件处理，该观察者会收到通知。

### 带输入的 SSE

SSE 默认使用 `GET`。如果需要查询参数，提供 `input` 和 `build`，与 `defineRequest` 相同：

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: struct.object({
    category: struct.string(),
  }),
  build(ctx, input) {
    ctx.setQueryParams({ category: input.category })
  },
  events: {
    item: struct.json(struct.object({ id: struct.number(), title: struct.string() })),
  },
})

const command = FilteredStream({ category: 'news' })
```

SSE 的 `build` 只支持映射 path、query 和 headers 这些请求部分。凭证应在客户端级别通过 `withCredentials(...)` 配置；`build(ctx, input)` 不暴露公开的凭证设置方法。

---

## defineWebSocket：WebSocket 定义

`defineWebSocket` 定义一个 WebSocket 端点，区分 **incoming**（服务器 → 客户端）和 **outgoing**（客户端 → 服务器）消息结构。

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
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

仅当公开输入形状与实际传输形状不同时，才使用 `build(ctx, input)`：

```typescript
const ChatSocketWithManualBuild = defineWebSocket({
  path: '/chat/:roomId',
  input: struct.object({
    roomId: struct.string(),
    tenant: struct.string(),
  }),
  build(ctx, input) {
    ctx.setPathParams({ roomId: input.roomId })
    ctx.setQueryParams({ tenant: input.tenant })
  },
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
})
```

### incoming 消息结构

`incoming` 定义服务器推送的消息类型。每条消息必须包含一个 `type` 字段，匹配 `incoming` 中的键。如果负载是对象，其字段会与 `type` 合并：

```typescript
// 服务器发送：{ type: 'message', user: 'Alice', text: 'Hi' }
// 解析为：    { type: 'message', user: 'Alice', text: 'Hi' }
```

如果负载是标量（字符串、数字等），它会被包装为 `{ type: 'xxx', data: <value> }`。

### outgoing 消息结构

`outgoing` 定义客户端发送的消息类型。`WebSocketSession.send(message)` 要求调用方传入一个消息对象，其中 `type` 必须是字符串，并匹配某个 `outgoing` 键；运行时不会在发送时根据 schema 键名自动补上 `type`。

```typescript
session.send({ type: 'sendMessage', text: 'hello' })
session.send({ type: 'joinRoom', roomId: 'lobby' })
```

当 outgoing 负载 schema 是对象时，把它的字段直接放在与 `type` 同一层；当 schema 是标量时，用 `data` 承载该值：

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const BinarySocket = defineWebSocket({
  path: '/binary',
  incoming: {
    ack: struct.boolean(),
  },
  outgoing: {
    chunk: struct.string(),
  },
})

session.send({ type: 'chunk', data: 'hello' })
```

### 只接收的 WebSocket

如果你不需要向服务器发送消息，省略 `outgoing`：

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: struct.object({ price: struct.number() }),
  },
})
```

### WebSocket build 限制

WebSocket 的 `build` 仅支持 `setPathParams` 和 `setQueryParams`。不支持 HTTP 专属操作（请求头、请求体）。

---

## 命令对象结构

无论定义类型如何，构建后的命令都是一个不透明的可执行值，对外主要承担两件事：

- 保存由 `defineRequest`、`defineEventStream` 或 `defineWebSocket` 创建的端点定义
- 保存你传给构建器的可选调用输入

运行时内部还会附加传输元数据，让 `Client.execute(...)` 能分发到正确的执行器（HTTP fetch、SSE 流或 WebSocket 连接）。这些元数据属于实现细节，不是公开 API 的一部分。

```typescript
const getUser = defineRequest({ method: 'GET', path: '/users/:id' })
const command = getUser({ path: { id: 42 } })

await client.execute(command)
```

从公开 API 视角看，把返回的命令值当作要传给 `Client.execute(...)` 的不透明对象即可。不要在应用代码里依赖公开 `.kind` 判断、内部 symbol，或结构反射。

---

## 输入可选规则

命令构建器参数是否可选，取决于声明的 `input` 形状：

1. **没有定义 `input`**：构建器可以不传参数调用。
2. **定义了 `input`，但其中所有字段都可选**：构建器参数仍然可选。
3. **`input` 中存在任意必填字段**：构建器参数变为必填。

```typescript
// 无 input — 可选
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// input 中所有字段都可选 — 仍然可选
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: struct.request({
    query: struct.object({ q: struct.string().optional() }),
  }),
})
B() // OK
B({ query: {} }) // OK

// 存在必填字段 — 参数必填
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: struct.request({
    body: struct.object({ name: struct.string() }),
  }),
})
C() // TypeScript 错误：缺少参数
C({ body: { name: 'defjs' } }) // OK
```

## 下一步

- [SSE →](/core/sse) — SSE 执行、重连和事件处理
- [WebSocket →](/core/web-socket) — WebSocket 连接、心跳和状态管理
- [客户端 →](/core/client) — 客户端创建和 `execute` 用法
