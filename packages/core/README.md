# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

## Install

```bash
npm install @defjs/core
```

## Quick start

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error)
} else {
  console.log((user as { id: number; name: string }).id, (user as { id: number; name: string }).name)
}
```

## Core ideas

- **Commands** are type-safe objects created by `defineRequest`, `defineEventStream`, and `defineWebSocket`.
- **Struct** declares request/response shapes and field wire names with `.alias(name)`.
- **Build** lets you manually map parsed input to request parts via `build(ctx, input)`.
- **Client** executes commands and dispatches to the right transport.

See `packages/core/design.md` for the full implementation boundary.
