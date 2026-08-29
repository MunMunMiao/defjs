---
title: Commands
description: 定义端点，打出 opaque command，映射输入，推断传输结果。
---

# Commands

一份 definition → builder → opaque command → `client.execute`。HTTP、SSE、WebSocket 同一条管线。

## 基本用法

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## 选哪种 definition

| Definition               | 契约                                              | 成功值                               |
| ------------------------ | ------------------------------------------------- | ------------------------------------ |
| `defineRequest(...)`     | Method、相对 path、可选 input、可选状态 output    | 解码数据 + `HttpResponse`            |
| `defineEventStream(...)` | Path、buffer/queue 上限、事件名 → Struct 映射     | `EventStreamHandle` + open 快照      |
| `defineWebSocket(...)`   | Path、incoming 映射、可选 outgoing 映射、队列上限 | `WebSocketSession` + connection 快照 |

没有 `input` → builder 不收参。有 `input` → 就算嵌套字段全可选也要传 Struct 值。可选的 `path` / `query` / `headers` 段可以省略；段里有必填字段就不能省。Body wrapper 一旦出现，body 就是必填。

保持 command 不透明。别去扒标签或 symbol。

## 自动请求映射

逻辑输入已经是 path / query / headers / body 时，用 `struct.request(...)`：

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: { 201: struct.object({ id: struct.number(), name: struct.string() }) },
})
void createUser
```

Alias 只改写出线上的 key。解析值和 command 输入仍用逻辑名。

## 自定义 `build`

调用方形状和线上形状不一致时再上 `build(request, input)`。这是受限投影——别在这儿按鉴权政策分支，也别搞副作用。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.withQuery({ q: input.q, page: input.page ?? 1 })
  },
  output: { 200: struct.object({ items: struct.array(struct.string()) }) },
})
void search
```

## 状态 output 形状

`output` 可以是 status → Struct 映射，也可以是 `{ status, body }[]`。精确状态优先。数组形式：后面的匹配会覆盖前面的分组匹配。没有匹配声明 → body 解码前就是 `UNDECLARED_STATUS`。

## 相关配方

- [声明了 404 的 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
