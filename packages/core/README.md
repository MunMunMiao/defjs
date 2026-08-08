# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

## Quick start context

This README follows the current repository source/workspace API for `@defjs/core`.

Install the workspace dependencies before running this source/workspace example:

```bash
pnpm install
```

To experiment with the snippet inside this repository, place it in a workspace package that resolves `@defjs/core` from source.

> Published package users: as checked on July 20, 2026, public npm provides `@defjs/core@0.3.3`, which predates the source/workspace API shown here. Check the installed package metadata and release notes before copying this example into an external app.

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

Repository browser tests cover HTTP, SSE, and WebSocket flows. The current workspace toolchain and package manifest require Node.js 26 or newer; other runtimes require separate compatibility verification. The current core manifest declares no runtime dependencies.

See `packages/core/design.md` for the full implementation boundary.
