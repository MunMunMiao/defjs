---
title: Commands
description: Define endpoints, create command builders and commands, map Struct input to the wire, and infer HTTP output types.
---

# Commands

Defjs uses three related stages:

1. An **endpoint definition** describes a stable HTTP, SSE, or WebSocket contract.
2. A **command builder** is the function returned by `defineRequest`, `defineEventStream`, or `defineWebSocket`.
3. A **command** is the value returned when you call that builder with input. Pass the command to `client.execute(...)`.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

Here, the object passed to `defineRequest` is the endpoint definition, `getUser` is the command builder, and `command` is the command.

## HTTP Endpoint Definitions

`defineRequest(...)` accepts these fields:

| Field          | Meaning                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| `method`       | HTTP method string.                                                           |
| `path`         | Relative endpoint path, with optional `:name` placeholders.                   |
| `input`        | Struct used for structural decoding of command input.                         |
| `build`        | Schema-bound projection from input fields to request parts. Requires `input`. |
| `output`       | Status-to-Struct mapping for response decoding and result inference.          |
| `responseType` | Optional `json`, `text`, `blob`, or `arraybuffer` response mode.              |

Use `struct.request(...)` when command fields map directly to wire sections:

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

Callers use logical field names. Aliases select the wire keys.

## Command Builder Optionality

A builder with no `input` accepts no argument:

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Object Struct inputs are partial at the type level. Every object property is optional for the caller. Request sections are also optional. Structural decoding fills non-optional output fields with zero values, so neither shape makes the builder argument required.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search() // Accepted. The decoded q value is ''.
search({ query: { q: 'docs' } })
```

Use a primitive or array input when the builder must receive an argument. This example uses a primitive and projects it into a path parameter:

```typescript
const getUserById = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.number(),
  build(request, input) {
    request.setPathParams({ id: input })
  },
})

// getUserById() // TypeScript error: an argument is required.
getUserById(42)
```

This is argument optionality, not business validation. A caller can still pass values accepted by the Struct's input type, and missing object fields receive zero values.

## Automatic Request Building

When `input` is a `struct.request(...)` and `build` is omitted, Defjs maps declared sections automatically:

- `path` replaces path placeholders.
- `query` becomes query parameters.
- `headers` becomes request headers.
- `body` uses its body wrapper.

Request bodies must declare a supported boundary:

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

Do not put a bare `struct.object(...)` in `request.body`; `struct.request(...)` rejects it. HTTP supports all body forms. SSE rejects a body section, and WebSocket rejects both headers and body sections.

## Custom `build`

Use `build(request, input)` when logical fields need different wire locations or keys. The `input` parameter is a **schema-bound projection**, not the parsed caller value.

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

A projection can:

- select declared fields;
- choose target wire keys;
- project an array one item to one item with `.map(...)`;
- encode a selected object using its field aliases when it is bound into JSON.

A projection cannot inspect caller values, branch on them, compute arbitrary transforms, change array cardinality, or inject literal values. For example, `request.setJson({ version: 'v1' })` is not a valid projection because `'v1'` did not come from the input binding view.

Normalize and validate application data before creating the command. Keep `build` for declarative wire mapping.

### Build Capabilities

| Target                                                 | HTTP | SSE | WebSocket |
| ------------------------------------------------------ | ---- | --- | --------- |
| `setPathParams`, `setQueryParams`                      | Yes  | Yes | Yes       |
| `setHeaders`, `addHeaders`                             | Yes  | Yes | No        |
| JSON, text, HTML, form, Blob, ArrayBuffer body methods | Yes  | No  | No        |

The TypeScript build context is transport-specific. Runtime checks also reject unsupported output if type checks were bypassed.

## HTTP Output Inference

`output` supports an object map or an array of status/body pairs:

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

The HTTP success type is the union of declared 2xx bodies. `error.data` is the union of declared non-2xx bodies. Array form needs `as const` to preserve status literals and grouped readonly arrays.

When `output` is declared, every returned status must have a matching Struct. An unmatched 2xx or non-2xx status produces `UNDECLARED_STATUS`. When `output` is omitted, the response body is ignored and the result is `undefined`.

## SSE and WebSocket Definitions

`defineEventStream(...)` replaces HTTP `output` with an `events` map. Event names select Structs, and an optional `default` entry handles undeclared names at runtime.

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` declares `incoming` and optional `outgoing` message maps. Message envelopes use a `type` discriminator.

```typescript
const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

See [SSE](/core/sse) and [WebSocket](/core/web-socket) for decoding, queues, reconnect, and closure ownership.

## Treat Commands as Opaque

Application code should create commands and pass them to `Client.execute(...)`. Do not depend on transport tags or structural reflection.

The root entry currently exports transport command interfaces and low-level executor functions. Those exports are not needed for the recommended workflow, and their long-term stability commitment is not established in this documentation. The command tag symbols and guard functions used by runtime dispatch are not root exports.

## Next

- [Client](/core/client) covers execution overloads and option composition.
- [HTTP](/core/http) owns URL, encoding, response, and cancellation behavior.
- [Struct](/core/struct) explains structural decoding and zero values.
