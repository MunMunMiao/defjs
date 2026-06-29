---
title: Design Decisions
description: API design decisions that may differ from common patterns in other HTTP libraries.
---

# Design Decisions

Defjs intentionally diverges from some common patterns found in other HTTP libraries. This document explains the design rationale behind each decision.

## Explicit Client Design

Defjs requires every client to be explicitly created. You create a `Client` with `createClient` and pass it to where it is needed.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

Why this design:

- **Test-friendly**: Pass different `Client` instances directly to tests without needing to reset or mock any state.
- **Multi-environment coexistence**: Multiple clients can run in parallel in the same process (e.g., internal API + public API) without interference.
- **Dependency transparency**: Callers must explicitly hold a `Client`, making dependencies visible for static analysis and code review.

If you need a shared client in your application, export it from a module:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## Framework Integration

`@defjs/angular`, `@defjs/vue`, and `@defjs/react` integrate explicit clients with each framework's dependency model. Angular and Vue use `provideClient` / `injectClient`; React uses `ClientProvider` / `useClient`. This allows clients to be registered and retrieved within the component or service tree.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // use client.execute(...) inside component logic
}
```

## Request-Level Options in `execute`, Not Builder

Request-level options (`abort`, `timeout`, `heartbeat`, `reconnect`, etc.) are passed via the second argument of `client.execute`, not the command builder.

```typescript
// Correct: request-level options go to execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## Overloaded `execute` by Command Type

`client.execute` is overloaded to return the correct result type based on the `Command` type automatically.

```typescript
// HTTP request — returns HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// SSE stream — returns StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — returns SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` is an Observer

SSE's `onInvalidEvent` is an observer. Exceptions thrown inside it are silently ignored and do not interrupt the stream.

```typescript
import { createClient, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // Even if this throws, the stream continues
    },
  }),
)
```

## Error Submodule Consolidation

All error symbols are exported from the main `@defjs/core` entry.

| Export                  | Description              | Typical Usage                                               |
| ----------------------- | ------------------------ | ----------------------------------------------------------- |
| `RequestError`          | Error union type         | `switch (error.kind)` branching                             |
| `ERR_ABORTED`           | Abort identifier         | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | Timeout identifier       | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | Create transport error   | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | Create definition error  | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | Create HTTP status error | `createHttpStatusError(404, 'Not Found', response, data)`   |

Import from the main entry:

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## Error Branching by `kind` and `code`

Defjs recommends branching by `kind` and `code` instead of string comparisons.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## Stricter Endpoint Definition Rules

Defjs enforces a strict rule: **when `build` is provided, `input` must also be provided.**

```typescript
// Correct: has input and build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
  ] as const,
})

// Correct: no input and no build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: [
    { status: 200, body: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
  ] as const,
})

// Error: has build but no input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(ctx, input) {
    ctx.setPathParams({ id: input.id }) // TypeScript error: missing input struct
  },
  output: [
    { status: 200, body: struct.object({ id: struct.number() }) },
  ] as const,
})
```

This rule also applies to `defineEventStream` and `defineWebSocket`.

## Dependencies

| Package          | Required Version |
| ---------------- | ---------------- |
| `@defjs/core`    | `^0.4.0`         |
| `@defjs/angular` | `19.x`           |
| `@defjs/vue`     | `^0.4.0`         |
| `@defjs/react`   | `^0.4.0`         |

Angular's peer dependency range: `>=18.0.0 <=22.0.0`. React peer dependency range: `>=18.0.0`. Node runtime: `>=26`.

## What's Next

- [Client →](/core/client) — Explicit client design and configuration
- [Commands →](/core/commands) — Command definitions and input rules
- [Errors →](/core/errors) — `RequestError` structure and branching
