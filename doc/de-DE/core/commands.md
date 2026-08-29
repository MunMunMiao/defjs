---
title: Commands
description: Endpoints definieren, opake Commands bauen, Inputs mappen und Transport-Ergebnisse inferieren.
---

# Commands

Eine Definition → Builder → opaker Command → `client.execute`. Dieselbe Pipeline für HTTP, SSE und WebSocket.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## Definition wählen

| Definition               | Vertrag                                                            | Erfolgreicher Wert                       |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| `defineRequest(...)`     | Method, relativer Path, optionaler Input, optionaler Status-Output | Dekodierte Daten + `HttpResponse`        |
| `defineEventStream(...)` | Path, Buffer-/Queue-Limits, Event-Name → Struct-Map                | `EventStreamHandle` + Open-Snapshot      |
| `defineWebSocket(...)`   | Path, Incoming-Map, optionale Outgoing-Map, Queue-Limit            | `WebSocketSession` + Connection-Snapshot |

Kein `input` → Builder nimmt kein Argument. Mit `input` → Struct-Wert übergeben, auch wenn jedes nested Field optional ist. Optionale `path`-/`query`-/`headers`-Sections dürfen fehlen; eine Section mit required Field nicht. Ein Body-Wrapper vorhanden heißt: Body ist required.

Halte Commands opak. Grab nicht in Tags oder Symbole.

## Automatisches Request-Mapping

Nutze `struct.request(...)`, wenn logischer Input schon Path / Query / Headers / Body hat:

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

Aliasse schreiben nur outbound Wire-Keys um. Geparste Werte und Command-Inputs behalten logische Namen.

## Custom `build`

Greif zu `build(request, input)`, wenn Caller-Shape und Wire-Shape auseinanderlaufen. Das ist eine eingeschränkte Projektion — kein Ort für Auth-Policy-Branching oder Side Effects.

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

## Status-Output-Shapes

`output` kann eine Status → Struct-Map oder ein `{ status, body }[]` sein. Exakter Status gewinnt. Array-Einträge: ein späterer Match überschreibt einen früheren gruppierten Match. Keine passende Deklaration → `UNDECLARED_STATUS` vor Body-Decode.

## Verwandte Rezepte

- [GET mit deklariertem 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
