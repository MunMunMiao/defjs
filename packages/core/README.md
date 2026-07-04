# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

## Quick start context

This README follows the current repository source/workspace API for `@defjs/core`.

Use these commands to install the workspace and verify the docs examples:

```bash
pnpm install
pnpm --dir doc run typecheck
```

To experiment with the snippet inside this repository, paste it into a workspace package or docs twoslash block that resolves `@defjs/core` from source.

> Published npm users: the current latest public release is still `@defjs/core@0.3.3`, which uses the older `createClient(options)` / `defineRequest(method, endpoint)` signatures. Before copying `withEndpoint(...)` or `struct.request(...)` into an external app, check the release notes for a published version that explicitly includes this API.

## Quick start

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

## Core ideas

- **Commands** are type-safe objects created by `defineRequest`, `defineEventStream`, and `defineWebSocket`.
- **Struct** declares request and response shapes, including request-shaped inputs via `struct.request({ path, query, headers, body })` and field wire names via `.alias(name)`.
- **Build** lets you manually map parsed input to request parts via `build(ctx, input)` when the public input shape differs from the wire shape.
- **Client** executes commands and dispatches to the right transport.

See `packages/core/design.md` for the full implementation boundary.
