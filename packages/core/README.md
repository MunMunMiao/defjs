# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

This README describes the package version that contains it. Defjs is still pre-1.0, so use the documentation and release notes shipped for the exact version installed in your application.

## Install

```sh
npm install @defjs/core
```

The package is ESM and declares no runtime dependencies.

## Quick Start

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
  console.error(error.kind, error.code)
} else {
  console.log(user.id, user.name)
}
```

## Core Boundaries

- Commands are typed values created by `defineRequest`, `defineEventStream`, and `defineWebSocket`.
- Structs validate request input and response data at runtime. `struct.request({ path, query, headers, body })` maps each request part explicitly.
- Expected HTTP, transport, and definition failures are returned in an error-first tuple; custom interceptors and application callbacks can still throw.
- Server clients that capture cookies, authorization, tenant data, or user data must be created inside the owning request scope.
- The code that starts HTTP, SSE, or WebSocket work owns cancellation and transport cleanup. A client has no global `dispose()` lifecycle.
- A timeout or cancellation does not prove that a server did not receive a write. Preserve operation identity and use an application/server idempotency contract before replaying writes.
- OpenAPI generation, full SDK generation, query caching, and GraphQL protocol handling are not included in this release. Define contracts by hand or compose purpose-built tools at the application boundary.

For client-local tests, inject a Fetch-compatible function with `withHTTPHandle(...)`. This keeps request interception scoped to one client and still exercises command building, interceptors, status dispatch, and response validation.

## Runtime Notes

The package manifest requires Node.js 22 or newer. Packed consumers have been checked on Node.js 22, 24, and 26. The same ESM HTTP consumer was also exercised on Bun 1.3.14 and Deno 2.9.5; those HTTP checks are not a blanket guarantee for every transport or future runtime version.

After compiling an application to ESM, the tested command shapes are:

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

The Deno command assumes dependencies were installed into `node_modules`; scope `--allow-net` to the real API hosts. Browser applications use their bundler and the platform Fetch, EventSource-compatible Fetch stream, and WebSocket capabilities required by the transports they enable.

## Documentation

The package includes the matching English guides and idempotency reference source, so these links stay usable from an installed tarball without repository access.

- [Getting started](docs/guide/getting-started.md)
- [Client scope and transport-injection testing](docs/core/client.md)
- [Commands and request mapping](docs/core/commands.md)
- [HTTP, cancellation, credentials, and XSRF](docs/core/http.md)
- [Error tuples and application adapters](docs/core/errors.md)
- [Interceptors, retry, and resilience boundaries](docs/core/interceptors.md)
- [Struct decoding](docs/core/struct.md)
- [SSE lifecycle](docs/core/sse.md)
- [WebSocket lifecycle and GraphQL boundary](docs/core/web-socket.md)
- [React adapter and SSR scope](docs/plugins/react.md)
- [Vue adapter and SSR scope](docs/plugins/vue.md)
- [Idempotent write example](examples/resilience-idempotency-key/README.md)
