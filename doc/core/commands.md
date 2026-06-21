---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# Commands

Defjs is built around "commands": type-safe executable objects created by `defineRequest`, `defineEventStream`, and `defineWebSocket`. Each command carries a `kind` (transport type), a `definition` (endpoint struct), and `input` (call data). The Client dispatches to the correct transport logic based on `kind`.

## defineRequest: HTTP Endpoint Definition

`defineRequest` defines a RESTful HTTP endpoint. It accepts a definition object and returns a command builder.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
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
2. **build**: Receives a `RequestBuilder` and parsed input (`RequestBuildInput`), mapping data to path params, query params, headers, and body.
3. **output**: Describes possible server responses. The Client selects the matching Struct by HTTP status code and derives success (2xx) and error (non-2xx) types.

If `build` is omitted, `input` must also be omitted. The command then accepts no input and sends directly to `path`.

If `build` is provided, `input` must also be provided. This is a strict design rule.

### Shortcut for No Input

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // No arguments needed
```

### Output Type Inference

`output` supports both array and object forms, with equivalent behavior:

```typescript
// Array form (recommended)
output: [
  { status: 200, body: UserStruct },
  { status: [401, 403], body: AuthErrorStruct },
]

// Object form
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
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### events Mapping

Each key in `events` corresponds to the SSE `event` field. The Client looks up the matching Struct by `event` name when a message arrives.

### default Fallback

If the server sends an undeclared event name, you can provide a `default` struct as fallback:

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // Unmatched events parsed as string
  },
})
```

Without `default`, unmatched events are discarded. If an `onInvalidEvent` interceptor is configured, it receives a notification.

### SSE with Input

SSE uses `GET` by default. If you need query parameters, provide `input` and `build` like `defineRequest`:

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

SSE `build` does not support request body or `withCredentials`.

---

## defineWebSocket: WebSocket Definition

`defineWebSocket` defines a WebSocket endpoint, distinguishing **incoming** (server → client) and **outgoing** (client → server) message structs.

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### incoming Message Struct

`incoming` defines message types pushed by the server. Each message must contain a `type` field matching an `incoming` key. If the payload is an object, its fields are merged with `type`:

```typescript
// Server sends: { type: 'message', user: 'Alice', text: 'Hi' }
// Parsed as:    { type: 'message', user: 'Alice', text: 'Hi' }
```

If the payload is a scalar (string, number, etc.), it is wrapped as `{ type: 'xxx', data: <value> }`.

### outgoing Message Struct

`outgoing` defines message types sent by the client. The `type` is auto-filled from the key name. You only provide the payload:

```typescript
// Send: { type: 'sendMessage', text: 'Hello' }
// Or:   { type: 'sendMessage', data: { text: 'Hello' } }
```

If an outgoing message payload is an object, both forms are supported. If it is a scalar, you must use `{ type: 'xxx', data: <value> }`.

### Incoming-Only WebSocket

If you do not need to send messages to the server, omit `outgoing`:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### WebSocket build Restrictions

WebSocket `build` only supports `setPathParams` and `setQueryParams`. HTTP-specific operations (headers, body) are not supported.

---

## Command Object Structure

Regardless of definition type, the built command follows a unified structure:

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP command
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE command
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket command
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` is the transport type tag. `Client.execute` dispatches to the appropriate executor (HTTP fetch, SSE stream, WebSocket connection) based on it.

---

## Input Optional Rules (IsInputOptional)

Whether a command builder's argument is optional is automatically inferred by `IsInputOptional`:

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

Rules:

1. **No `input` defined**: `TInput` is `undefined`, parameter is fully optional.
2. **Has `input` but all fields are optional**: `{} extends EndpointInput<...>` is true, parameter is still optional.
3. **Has `input` with required fields**: Parameter is required.

```typescript
// No input — optional
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// Input with all optional fields — optional
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// Required fields — required
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript error: missing argument
C({ body: { name: 'defjs' } }) // OK
```

## What's Next

- [SSE →](/core/sse) — SSE execution, reconnect, and event handling
- [WebSocket →](/core/web-socket) — WebSocket connection, heartbeat, and state management
- [Client →](/core/client) — Client creation and `execute` usage
