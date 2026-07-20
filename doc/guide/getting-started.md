---
title: Getting Started
description: Use the current repository source/workspace API to create your first typed request, with separate notes for published npm/CDN users.
---

# Getting Started

Defjs is a TypeScript library for defining typed HTTP, SSE, and WebSocket APIs and executing them across JavaScript runtimes.

## Repository source/workspace track

This tutorial targets the current repository source/workspace API.

To follow the examples on this page exactly, install workspace dependencies and run them from a workspace package that resolves `@defjs/core` from this repository source:

```sh
pnpm install
pnpm --dir doc run typecheck
```

::: info Development baseline
This repository is developed with Node `>=26`, `pnpm@11.6.0`, and `engine-strict=true`. That baseline is for contributors working in this monorepo. Installing a published defjs package into an application follows the package's published runtime and bundler constraints.
:::

## Published npm/CDN caveat

If you install `@defjs/core` from npm or import it from a CDN, the published release you use may lag behind this tutorial.

This page does not provide a separate guide for older published APIs. Before copying `withEndpoint(...)` or `struct.request(...)` into an external app, use a published release whose installed package metadata, README, or release notes explicitly include this API.

If you need a CDN import for a published release, follow that release's published README/API reference rather than the source/workspace examples below.

## Three Steps to Your First Request

### Step 1: Create a Client

The Client is the entry point for all request execution. Create an instance with `createClient` and configure the base endpoint:

```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### Step 2: Define a Request

Use `defineRequest` to define a typed HTTP endpoint. Use `struct.request(...)` when your input maps directly to HTTP path, query, headers, or body sections:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
    {
      status: 404,
      body: struct.object({
        message: struct.string(),
      }),
    },
  ] as const,
})
```

::: tip
The examples in this guide use the array form because it keeps status/body pairs explicit and supports grouping multiple statuses. Object-form `output` is still supported and remains useful for compact reference examples.
:::

### Step 3: Execute

Call `client.execute` with your request command. HTTP execution returns an error-first tuple: success is `[null, result, response]`, failure is `[error, undefined, response?]`.

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
    {
      status: 404,
      body: struct.object({
        message: struct.string(),
      }),
    },
  ] as const,
})

async function loadUser() {
  const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

  if (error) {
    console.error(error.code, error.message)
    return
  }

  console.log(user.name)
}
```

## Complete Example

Here is an end-to-end example with automatic request mapping, output validation, error handling, and an interceptor:

```typescript
import { createClient, createHttpInterceptor, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (request, next) => {
  const headers = request.headers ?? new Headers()
  request.headers = headers
  headers.set('Authorization', 'Bearer token')
  return next(request)
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(authInterceptor))

const createPostRequest = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.request({
    headers: struct.object({
      'X-Request-ID': struct.string(),
    }),
    body: struct.object({
      title: struct.string(),
      body: struct.string(),
    }),
  }),
  output: [
    {
      status: 201,
      body: struct.object({
        id: struct.number(),
        title: struct.string(),
      }),
    },
    {
      status: 400,
      body: struct.object({
        field: struct.string(),
        reason: struct.string(),
      }),
    },
  ] as const,
})

async function submitPost() {
  const [error, post] = await client.execute(
    createPostRequest({
      headers: { 'X-Request-ID': 'uuid-123' },
      body: { title: 'Hello', body: 'World' },
    }),
  )

  if (error) {
    console.error(error)
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## Core API Quick Reference

| API                    | Description                     | Typical Usage                                                                                                                                                                        |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createClient`         | Create a request client         | `createClient(withEndpoint('https://api.example.com'))`                                                                                                                              |
| `defineRequest`        | Define an HTTP endpoint         | `defineRequest({ method: 'GET', path: '/user/:id', input: struct.request({ path: struct.object({ id: struct.number() }) }), output: [{ status: 200, body: UserStruct }] as const })` |
| `defineEventStream`    | Define an SSE endpoint          | `defineEventStream({ path: '/events', events: { message: struct.string() } })`                                                                                                       |
| `defineWebSocket`      | Define a WebSocket endpoint     | `defineWebSocket({ path: '/ws', incoming, outgoing })`                                                                                                                               |
| `struct`               | Struct builder                  | `struct.object({ id: struct.number() })`                                                                                                                                             |
| `.alias(name)`         | Field wire-name alias           | `struct.string().alias('user_name')`                                                                                                                                                 |
| `withEndpoint`         | Set base URL                    | `withEndpoint('https://api.example.com')`                                                                                                                                            |
| `withInterceptors`     | Register interceptors           | `withInterceptors(loggingInterceptor, authInterceptor)`                                                                                                                              |
| `withCredentials`      | Enable cross-origin credentials | `withCredentials(true)`                                                                                                                                                              |
| `withSSEReconnect`     | Configure SSE reconnect policy  | `withSSEReconnect({ attempts: 3, delayMs: 1000 })`                                                                                                                                   |
| `withWebSocketOptions` | Configure WebSocket options     | `withWebSocketOptions({ protocols: ['v1'] })`                                                                                                                                        |

## What's Next

- [Client →](/core/client) — Creating clients, executing commands, and configuration
- [Commands →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [Errors →](/core/errors) — `RequestError` structure and branching patterns
