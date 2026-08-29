---
title: Commands
description: 定義 endpoints、建立不透明 commands、對應 inputs，並推導傳輸結果。
---

# Commands

一份定義 → builder → 不透明 command → `client.execute`。HTTP、SSE、WebSocket 走同一條管線。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## 選定義

| 定義                     | 契約                                              | 成功時的值                           |
| ------------------------ | ------------------------------------------------- | ------------------------------------ |
| `defineRequest(...)`     | Method、相對 path、選填 input、選填 status output | 解碼後的資料 + `HttpResponse`        |
| `defineEventStream(...)` | Path、buffer／queue 限制、event-name → Struct map | `EventStreamHandle` + open 快照      |
| `defineWebSocket(...)`   | Path、incoming map、選填 outgoing map、queue 限制 | `WebSocketSession` + connection 快照 |

沒有 `input` → builder 不吃參數。有 `input` → 就算巢狀欄位全是 optional，也要傳 Struct 值。選填的 `path`／`query`／`headers` 區段可以省略；區段裡有必填欄位就不行。有 body wrapper 就表示 body 必填。

讓 commands 保持不透明。別去挖 tags 或 symbols。

## 自動 request 對應

當邏輯 input 已有 path／query／headers／body 時，用 `struct.request(...)`：

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

Aliases 只改 outbound wire keys。剖析後的值與 command inputs 仍用邏輯名稱。

## 自訂 `build`

當呼叫端形狀與 wire 形狀不同時，才用 `build(request, input)`。它是受約束的投影 — 不是放 auth 政策分支或搞 side effects 的地方。

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

## Status output 形狀

`output` 可以是 status → Struct map，或 `{ status, body }[]`。精確 status 優先。陣列項目：較晚的 match 會覆寫較早的 grouped match。沒有相符宣告 → 在 body 解碼前得到 `UNDECLARED_STATUS`。

## 相關 recipes

- [已宣告 404 的 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
