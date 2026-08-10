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

Use the equivalent `npm`, Yarn, or Bun command if your project uses another package manager. `@defjs/core` is ESM. When you run it in Node.js, the current package metadata requires Node 22 or newer.

Packed ESM HTTP consumers were exercised with Node.js 22, 24, and 26, Bun 1.3.14, and Deno 2.9.5. After compiling your application, the corresponding command shapes are:

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

The Deno command uses packages already installed in `node_modules`; replace the network permission with the exact API hosts your application needs. The Bun and Deno checks cover the documented HTTP slice, not every platform API or transport. Browser builds use their normal bundler and the required platform Fetch and WebSocket capabilities.

Add an adapter only when your application needs it:

| Application setup         | Packages                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| React 18+                 | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+                    | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| Server-side OpenTelemetry | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip Match the docs to your installed version
These pages describe the current documentation source. Published packages bundle the matching English guides. Check the version installed in your application and do not mix examples across releases.
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

On success, `error` is `null`, `result` is decoded output data, and `response` is a Defjs `HttpResponse` wrapper. On failure, `result` is `undefined`; the response wrapper is also `undefined` when no response was received.

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

- [Commands](../core/commands.md) explains automatic request mapping and custom schema-bound projections.
- [Errors](../core/errors.md) shows how to handle transport and HTTP failures in application code.
- [HTTP](../core/http.md) covers URL resolution, request bodies, output decoding, cancellation, and XSRF behavior.
- [Examples](./examples.md) provides complete recipes you can adapt to your own API and application boundaries.
