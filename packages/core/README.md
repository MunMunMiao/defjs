# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

This README describes the package version that contains it. Defjs is still pre-1.0, so use the documentation and release notes published for the exact version installed in your application.

## Install

```sh
bun add @defjs/core
```

The package is ESM and declares no runtime dependencies. Its tarball retains this `README.md` and the repository `LICENSE`; repository-wide guides and examples remain outside the package.

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
  ],
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(String(error), error.kind, error.code)
} else {
  console.log(user.id, user.name)
}
```

`defineRequest(...)` preserves inline output status literals through a const generic, so the array does not need `as const`.

## Core Boundaries

- Commands are typed values created by `defineRequest`, `defineEventStream`, and `defineWebSocket`.
- Structs validate request input and response data at runtime. `struct.request({ path, query, headers, body })` maps each request part explicitly.
- Expected HTTP, transport, and definition failures are returned as native `RequestError` instances in an error-first tuple; custom interceptors and application callbacks can still throw. `String(error)` is directly loggable, while `kind`, `code`, and variant metadata remain enumerable for structured logs.
- Transport and definition errors use the native `Error` cause chain. Narrow `error.cause instanceof StructError` before calling Struct-only helpers such as `format()`, `flatten()`, or `prettify()`.
- Server clients that capture cookies, authorization, tenant data, or user data must be created inside the owning request scope.
- Ordinary HTTP work is request-scoped and is bounded with its execute-time timeout or `AbortSignal`; `Client` is not `AsyncDisposable` and has no global `dispose()` lifecycle.
- Returned SSE and WebSocket handles are `AsyncDisposable`, so `await using` waits for Defjs-owned teardown. SSE disposal stops Defjs reading/reconnect work and releases its reader lock, but does not wait forever for a provider-controlled `cancel()` promise.
- WebSocket `closed` is the logical terminal result. Its disposer uses a one-second bounded teardown and may reject with `TimeoutError`; it cannot prove physical TCP closure. Existing `close()` and `closed` APIs remain available for manual lifecycle control.
- A timeout or cancellation does not prove that a server did not receive a write. Preserve operation identity and use an application/server idempotency contract before replaying writes.
- OpenAPI generation, full SDK generation, query caching, and GraphQL protocol handling are not included in this release. Define contracts by hand or compose purpose-built tools at the application boundary.

For client-local tests, inject a Fetch-compatible function with `withHTTPHandle(...)`. This keeps request interception scoped to one client and still exercises command building, interceptors, status dispatch, and response validation.

### WebSocket provider envelopes

`defineWebSocket` accepts synchronous, definition-local `normalizeIncoming` and `normalizeOutgoing` boundaries for providers that do not use Defjs's default top-level `type` envelope. Incoming normalization runs after wire JSON decoding and returns a declared dispatch tag plus the payload to validate. Outgoing normalization receives the logical tag and the Struct-encoded payload, then returns the exact pre-transport wire value.

```typescript
const kraken = defineWebSocket({
  incoming: {
    'method.subscribe': struct.object({ method: struct.literal('subscribe'), success: struct.boolean() }),
  },
  maxIncomingQueueSize: 16,
  normalizeIncoming(decoded) {
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return undefined
    if (Reflect.get(decoded, 'method') !== 'subscribe') return undefined
    return { data: decoded, type: 'method.subscribe' }
  },
  normalizeOutgoing(_type, encodedPayload) {
    if (typeof encodedPayload !== 'object' || encodedPayload === null || Array.isArray(encodedPayload)) {
      throw new TypeError('Expected encoded command')
    }
    return encodedPayload as { readonly [key: string]: unknown }
  },
  outgoing: {
    subscribe: struct.object({
      method: struct.literal('subscribe'),
      params: struct.object({ channel: struct.string() }),
      reqId: struct.number().alias('req_id'),
    }),
  },
  path: '/v2',
})

// session.send({ type: 'subscribe', method: 'subscribe', params: { channel: 'ticker' }, reqId: 1 })
// wire: {"method":"subscribe","params":{"channel":"ticker"},"req_id":1}
```

Both adapters are synchronous. An outgoing adapter exception escapes `session.send()` synchronously; heartbeat serialization uses the existing fatal runtime path. Reconnect queues retain the already-normalized serialized string. If a provider payload itself has a wire `type`, declare it under a non-dispatch property such as `providerType: struct.literal('update').alias('type')`.

The adapters do not replace Struct validation, WebSocket subprotocols, reconnect policy, or session lifecycle. Without them, incoming results and outgoing bytes keep the legacy Defjs envelope behavior.

## Runtime Notes

Repository development, testing, building, packaging, and publishing use Bun `1.4.0`. The package uses standard Web APIs such as `fetch`, `Request`, `Response`, `Headers`, streams, and `WebSocket` according to the transports enabled by the application. The packed-consumer gate typechecks and executes the published artifact with Bun `1.4.0`.

The repository-validated and supported minimum compiler/lib contract uses `target: 'ES2022'` with `lib: ['ES2022', 'ESNext.Disposable', 'DOM', 'DOM.Iterable']`. The gate is pinned to TypeScript 7; older compiler versions are not promised. This supported set is verified together rather than claiming that every entry is independently forced by one declaration, and it supplies types only — not runtime Web API polyfills.

**SSE reconnect behavior change:** without `withSSEReconnect(...)`, SSE no longer retries network/stream-read failures. Pass `withSSEReconnect({ attempts: 3 })` (or another reviewed budget) for EventSource-style retries.

When using a checkout through `file:` or a workspace link, run `bun run build` in the checkout before compiling or running the external consumer. The checkout manifest points to generated `dist/` files; published packages already contain those files.

After compiling an application to ESM, the repository-tested command is:

```sh
bun run dist/index.js
```

Browser applications use their bundler and the platform Fetch, EventSource-compatible Fetch stream, and WebSocket capabilities required by the transports they enable.

## Documentation

Guides live on the documentation site, not in the published tarball.

- [Getting started](https://defjs.org/guide/getting-started)
- [Client](https://defjs.org/core/client)
- [HTTP](https://defjs.org/core/http)
- [SSE](https://defjs.org/core/sse)
- [WebSocket](https://defjs.org/core/web-socket)
