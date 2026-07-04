---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# Commands

Defjs is built around "commands": type-safe executable values created by `defineRequest`, `defineEventStream`, and `defineWebSocket`. At runtime they carry endpoint metadata plus optional call input, and `Client.execute` uses internal transport metadata to dispatch them. Treat commands as opaque values: user code should pass them to `Client.execute(...)`, not depend on public transport-tag checks or internal reflection.

## defineRequest: HTTP Endpoint Definition

`defineRequest` defines a RESTful HTTP endpoint. It accepts a definition object and returns a command builder.

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

### Definition Object Fields

| Field          | Type                              | Description                                                     |
| -------------- | --------------------------------- | --------------------------------------------------------------- |
| `method`       | `string`                          | HTTP method, e.g., `GET`, `POST`                                |
| `path`         | `string`                          | URL path, supports `:param` placeholders                        |
| `input`        | `AnyStruct \| undefined`          | Input data Struct validator                                     |
| `build`        | `RequestBuildHandler`             | Maps parsed input to HTTP request parts                         |
| `output`       | `RequestOutputShape \| undefined` | Maps status codes to response Structs                           |
| `responseType` | `HttpResponseType`                | Optional, forces response parsing mode (`json`, `text`, `blob`) |

### input / output / build Relationship

1. **input**: Describes the data the caller must provide. At execution time, the Client validates and parses raw input using the `input` Struct.
2. **build**: Receives a `RequestBuilder` and parsed input (`RequestBuildInput`), mapping data to path params, query params, headers, and body. Use it when the public input shape differs from the wire shape, or when you need custom mapping logic.
3. **output**: Describes possible server responses. The Client selects the matching Struct by HTTP status code and derives success (2xx) and error (non-2xx) types.

When `input` uses `struct.request({ path, query, headers, body })`, the runtime can build request parts automatically without `build`.

If `input` is omitted, `build` must also be omitted. The command then accepts no input and sends directly to `path`.

If `build` is provided, `input` must also be provided.

### Shortcut for No Input

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // No arguments needed
```

### Output Type Inference

`output` supports both array and object forms, with equivalent behavior.

The examples in this guide use the array form because it keeps status/body pairs explicit and supports grouping multiple statuses. Object-form `output` is still supported and remains useful for compact reference examples.

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

Execution results are typed automatically: 2xx data enters the success branch, everything else enters the error branch.

---

## defineEventStream: SSE Stream Definition

`defineEventStream` defines a Server-Sent Events (SSE) endpoint. It maps event names to Structs for event-level type safety.

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

### events Mapping

Each key in `events` corresponds to the SSE `event` field. The Client looks up the matching Struct by `event` name when a message arrives.

### default Event Handling

If the server sends an undeclared event name, you can provide a `default` struct:

```typescript
import { defineEventStream, struct } from '@defjs/core'

const Stream = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(), // Unmatched events parsed as string
  },
})
```

Without `default`, unmatched events are discarded. If invalid-event handling is configured with `withSSEOptions({ onInvalidEvent })` or `withSSEOnInvalidEvent(...)`, that observer receives a notification.

### SSE with Input

SSE uses `GET` by default. If you need query parameters, provide `input` and `build` like `defineRequest`:

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

SSE `build` only supports mapping path, query, and header request parts. Configure credentials at the client level with `withCredentials(...)`; `build(ctx, input)` does not expose a public credentials setter.

---

## defineWebSocket: WebSocket Definition

`defineWebSocket` defines a WebSocket endpoint, distinguishing **incoming** (server → client) and **outgoing** (client → server) message structs.

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

Use `build(ctx, input)` only when the public input shape differs from the wire shape:

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

### incoming Message Struct

`incoming` defines message types pushed by the server. Each message must contain a `type` field matching an `incoming` key. If the payload is an object, its fields are merged with `type`:

```typescript
// Server sends: { type: 'message', user: 'Alice', text: 'Hi' }
// Parsed as:    { type: 'message', user: 'Alice', text: 'Hi' }
```

If the payload is a scalar (string, number, etc.), it is wrapped as `{ type: 'xxx', data: <value> }`.

### outgoing Message Struct

`outgoing` defines message types sent by the client. `WebSocketSession.send(message)` expects a message object whose `type` string matches one of the `outgoing` keys; the runtime does not auto-fill `type` from the schema key at send time.

```typescript
session.send({ type: 'sendMessage', text: 'hello' })
session.send({ type: 'joinRoom', roomId: 'lobby' })
```

When an outgoing payload schema is an object, put its fields at the top level next to `type`. When the schema is a scalar, use `data` for the value:

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

### Incoming-Only WebSocket

If you do not need to send messages to the server, omit `outgoing`:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: struct.object({ price: struct.number() }),
  },
})
```

### WebSocket build Restrictions

WebSocket `build` only supports `setPathParams` and `setQueryParams`. HTTP-specific operations (headers, body) are not supported.

---

## Command Object Structure

Regardless of definition type, the built command is an opaque executable value with two public-facing roles:

- it captures the endpoint definition created by `defineRequest`, `defineEventStream`, or `defineWebSocket`
- it captures the optional call input you pass to the builder

Internally the runtime also attaches transport metadata so `Client.execute(...)` can dispatch the command to the correct executor (HTTP fetch, SSE stream, or WebSocket connection). That metadata is an implementation detail rather than part of the public API.

```typescript
const getUser = defineRequest({ method: 'GET', path: '/users/:id' })
const command = getUser({ path: { id: 42 } })

await client.execute(command)
```

Treat the returned command value as something to pass into `Client.execute(...)`. Do not depend on public `.kind` checks, internal symbols, or structural reflection in application code.

---

## Input Optional Rules

Whether a command builder argument is optional follows the declared `input` shape:

1. **No `input` defined**: the builder can be called with no argument.
2. **`input` exists but every field is optional**: the builder argument stays optional.
3. **`input` contains any required field**: the builder argument becomes required.

```typescript
// No input — optional
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// Input with all optional fields — still optional
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: struct.request({
    query: struct.object({ q: struct.string().optional() }),
  }),
})
B() // OK
B({ query: {} }) // OK

// Required fields — argument required
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: struct.request({
    body: struct.object({ name: struct.string() }),
  }),
})
C() // TypeScript error: missing argument
C({ body: { name: 'defjs' } }) // OK
```

## What's Next

- [SSE →](/core/sse) — SSE execution, reconnect, and event handling
- [WebSocket →](/core/web-socket) — WebSocket connection, heartbeat, and state management
- [Client →](/core/client) — Client creation and `execute` usage
