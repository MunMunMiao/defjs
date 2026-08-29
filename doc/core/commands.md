---
title: Commands
description: Define endpoints, build opaque commands, map inputs, and infer transport results.
---

# Commands

One definition → builder → opaque command → `client.execute`. Same pipeline for HTTP, SSE, and WebSocket.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## Choose a definition

| Definition               | Contract                                                      | Successful value                         |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| `defineRequest(...)`     | Method, relative path, optional input, optional status output | Decoded data + `HttpResponse`            |
| `defineEventStream(...)` | Path, buffer/queue limits, event-name → Struct map            | `EventStreamHandle` + open snapshot      |
| `defineWebSocket(...)`   | Path, incoming map, optional outgoing map, queue limit        | `WebSocketSession` + connection snapshot |

No `input` → builder takes no argument. With `input` → pass the Struct value even if every nested field is optional. Optional `path` / `query` / `headers` sections may be omitted; a section with a required field may not. A body wrapper present means the body is required.

Keep commands opaque. Don’t dig into tags or symbols.

## Automatic request mapping

Use `struct.request(...)` when logical input already has path / query / headers / body:

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

Aliases rewrite outbound wire keys only. Parsed values and command inputs keep logical names.

## Custom `build`

Reach for `build(request, input)` when the caller shape and wire shape differ. It’s a constrained projection — not a place to branch on auth policy or invent side effects.

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

## Status output shapes

`output` can be a status → Struct map or an `{ status, body }[]`. Exact status wins. Array entries: a later match overrides an earlier grouped match. No matching declaration → `UNDECLARED_STATUS` (`kind: 'definition'`). `error.response` may still be present; that body is not Struct-decoded as success.

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
