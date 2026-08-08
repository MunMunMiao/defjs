---
title: Getting Started
description: Install Defjs, define a typed HTTP endpoint, create a client, and call it from your application.
---

# Getting Started

Defjs lets your application describe an API contract once, then reuse that contract with typed input, runtime decoding, and explicit transport results.

## Install

Add the core package to your application:

```sh
pnpm add @defjs/core
```

Use the equivalent `npm`, Yarn, or Bun command if your project uses another package manager. `@defjs/core` is ESM. When you run it in Node.js, the current package metadata requires Node 26 or newer.

Add an adapter only when your application needs it:

| Application setup         | Packages                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| React 18+                 | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+                    | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| Server-side OpenTelemetry | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip Match the docs to your installed version
These pages describe the API shown in this documentation release. Check the version installed in your application. If an export or option differs, use the documentation and release notes for that installed version instead of mixing examples across versions.
:::

## Define Your First Request

Assume your API exposes `GET /users/:id`. Replace the base URL and response Structs with the contract used by your own service.

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

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` returns a **command builder**. Calling `getUser(...)` creates a **command** that holds the endpoint definition and call input. `client.execute(...)` then returns an HTTP three-item tuple:

```typescript
;[error, result, response]
```

On success, `error` is `null`, `result` is decoded output data, and `response` is a Defjs `SettledResponse` wrapper. On failure, `result` is `undefined`; the response wrapper is also `undefined` when no response was received.

### Why `as const` Matters

Array-form `output` uses status literals to separate 2xx success bodies from non-2xx error bodies. `as const` preserves those status values and any grouped status arrays as readonly literals. Without it, TypeScript can widen them to `number` or `number[]`, which weakens the inferred success and error branches.

Object-form output is also supported:

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## Put It in Your Application

Keep endpoint definitions in modules that describe your service API. Reuse their command builders from components, route handlers, jobs, or stores. Create the client at the boundary that owns its endpoint, credentials, interceptors, and lifecycle:

- a browser application can usually share one client;
- server rendering should create a request-scoped client when headers, cookies, users, or tenants differ per request;
- code that opens SSE or WebSocket resources must also consume and close them.

## Next Steps

- [Commands](/core/commands) explains automatic request mapping and custom schema-bound projections.
- [Errors](/core/errors) shows how to handle transport and HTTP failures in application code.
- [HTTP](/core/http) covers URL resolution, request bodies, output decoding, cancellation, and XSRF behavior.
- [Examples](/guide/examples) provides complete recipes you can adapt to your own API and application boundaries.
