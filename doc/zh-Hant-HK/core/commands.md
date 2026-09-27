---
title: Commands
description: Define endpoints，build opaque commands，map inputs，再 infer transport results。
---

# Commands

一個 definition → builder → opaque command → `client.execute`。HTTP、SSE、WebSocket 同一條 pipeline。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## 揀 definition

| Definition               | Contract                                                      | Successful value                         |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| `defineRequest(...)`     | Method、relative path、optional input、optional status output | Decoded data + `HttpResponse`            |
| `defineEventStream(...)` | Path、buffer/queue limits、event-name → Struct map            | `EventStreamHandle` + open snapshot      |
| `defineWebSocket(...)`   | Path、incoming map、optional outgoing map、queue limit        | `WebSocketSession` + connection snapshot |

冇 `input` → builder 唔收 argument。有 `input` → 即使 nested fields 全部 optional，都要傳 Struct value。Optional `path` / `query` / `headers` sections 可以 omit；有 required field 嘅 section 唔可以。有 body wrapper 就代表 body required。

Keep commands opaque。唔好挖 tags 或者 symbols。

## Automatic request mapping

當 logical input 已經有 path / query / headers / body 時，用 `struct.request(...)`：

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
})
void createUser
```

Aliases 淨係 rewrite outbound wire keys。Parsed values 同 command inputs 保留 logical names。

## Custom `build`

當 caller shape 同 wire shape 唔一樣時，先用 `build(request, input)`。佢係 constrained projection — 唔係 branch auth policy 或者 invent side effects 嘅地方。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.setQueryParams({ q: input.q, page: input.page })
  },
  output: struct.object({ items: struct.array(struct.string()) }),
})
void search
```

## `output` 同 `error` 嘅形狀

`output` 係 2xx body 嘅單一 Struct；`error` 係其餘一切嘅單一 Struct。`ok` 係唯一分流點，而且只有一邊會解碼。唔寫一邊就意味住嗰個 body 根本唔會被讀：fault 帶住 status，`data` 保持 `undefined`。

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
