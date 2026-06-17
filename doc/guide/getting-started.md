---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# Getting Started

Defjs is a TypeScript library for defining typed request APIs and executing them across multiple transports and JavaScript runtimes.

## Installation

Use your preferred package manager:

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## CDN Usage

Import directly as an ES module without a build tool:

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## Three Steps to Your First Request

### Step 1: Create a Client

The Client is the entry point for all request execution. Create an instance with `createClient` and configure the base endpoint:

```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### Step 2: Define a Request

Use `defineRequest` to define a typed HTTP endpoint. Use `struct` to describe the shape of inputs and responses:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    '200': struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    '404': struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
The keys in `output` are HTTP status codes. Defjs automatically selects the matching schema at runtime and derives TypeScript types accordingly: 2xx responses are typed as success data, non-2xx as error data.
:::

### Step 3: Execute

Call `client.execute` with your request command and optional configuration:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    '200': struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    '404': struct.object({
      message: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser({ id: 1 }))

  if (error) {
    // error is typed based on the non-2xx schemas in output
    console.error(error.code, error.message)
    return
  }

  // user is typed as { id: number; name: string }
  console.log(user.name)
}
```

## Complete Example

Here is an end-to-end example with input validation, output validation, error handling, and an interceptor:

```typescript
import { createClient, defineRequest, struct, tag, withEndpoint, withInterceptors } from '@defjs/core'

// 1. Create Client
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. Define Request
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': tag(struct.string(), { kind: 'header' }),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. Execute
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## Core API Quick Reference

| API                    | Description                     | Typical Usage                                                                  |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | Create a request client         | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | Define an HTTP endpoint         | `defineRequest({ method: 'GET', path: '/user', output: { 200: UserSchema } })` |
| `defineEventStream`    | Define an SSE endpoint          | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | Define a WebSocket endpoint     | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | Schema builder                  | `struct.object({ id: struct.number() })`                                       |
| `tag`                  | Metadata tag for fields         | `tag(struct.string(), { kind: 'header' })`                                     |
| `withEndpoint`         | Set base URL                    | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | Register interceptors           | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | Enable cross-origin credentials | `withCredentials(true)`                                                        |
| `withSSEOptions`       | Configure SSE options           | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | Configure WebSocket options     | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## What's Next

- [Client →](/core/client) — Creating clients, executing commands, and configuration
- [Commands →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [Errors →](/core/errors) — `RequestError` structure and branching patterns
