---
title: Design decisions
description: Why Defjs keeps contracts, commands, transport results, decoding, and ownership explicit.
---

# Design decisions

Defjs makes a few deliberate trade-offs. Convenience APIs often hide who owns a request, stream, or session. Defjs keeps that boundary visible so you can reuse the same endpoint contract without silently picking up a cache, retry scheduler, or resource manager.

## Explicit clients

`createClient(...)` makes endpoint config an explicit value. Different environments or request scopes get different endpoints, credentials, interceptors, serializers, and transport handles.

The cost: no process-wide default. That cost helps on a server — create the client inside the request boundary when options or closures capture auth, cookies, users, tenants, or request metadata. An explicit client still doesn’t isolate state captured by an interceptor. Client identity isn’t a security boundary by itself.

A client dispatches commands. It doesn’t own active work. Whoever starts an HTTP request, SSE stream, or WebSocket session must cancel or close it and await the terminal promise.

## Definitions, builders, and commands

The definition is the stable contract: method, path, input Struct, output mapping, transport limits. The builder is the callable view. Calling it creates one opaque command for a single execution.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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

const command = getUser({ path: { id: 7 } })
```

A background job and a UI owner can execute the same `getUser` shape with different cancel/retry policies. Keeping the command opaque stops app code from depending on internal transport tags or symbols.

## Transport-specific results

All three transports use an error-first tuple. A single generic “response” would erase lifecycle facts.

- HTTP → `[error, data, response]` — decoded output + `HttpResponse`
- SSE → `[error, stream, open]` — one logical stream + startup response snapshot
- WebSocket → `[error, session, connection]` — logical session + startup connection snapshot

The third value is a snapshot, not a promise that future reconnects keep the same physical connection. Startup failure can still include a response/snapshot when the transport produced one first. After startup, lifecycle control belongs to the returned handle or session.

## Runtime decoding

TypeScript inference describes what you expect; it can’t check a server response at runtime. Struct parsing is the second half of the contract. Defjs validates command input before request construction, decodes the selected representation, then parses the matching Struct.

That order keeps status and body as separate facts. Exact declared status selection happens **before** body decode. Declared non-2xx → typed `error.data`. Malformed declared body → `RESPONSE_VALIDATION_FAILED`. Undeclared status → `UNDECLARED_STATUS` (not an untyped success/failure). Stricter than “whatever JSON arrived,” but you can make a safe decision.

## The limits of `build`

Automatic `struct.request(...)` mapping is the default when input already has path/query/headers/body. Custom `build(request, input)` is a constrained projection when caller shape and wire shape differ:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` is a schema-bound view, not the caller’s runtime object. The projection can select declared fields, rename targets, and map one source array item to one output item. It can’t branch on values, inject literals, or change cardinality. Normalize business data and do value-dependent validation before creating the command.

## Observers and policy placement

Interceptors are for transport-wide policy: auth, tracing, short-circuit, reviewed retry. They run only for their transport and compose in onion order. Execution options are for work-specific lifetime: `signal`, `timeout`, WebSocket heartbeat, opt-in reconnect.

Observers report what happened without becoming a second owner. SSE `onInvalidEvent`, WebSocket state listeners, and runtime-error listeners are for bounded diagnostics and metrics. The returned stream/session still owns iteration, close, unsubscribe, and terminal waiting. Caching, stale-result suppression, idempotency, and domain error mapping belong around `client.execute(...)`, where your app can see its own policy and state.

## OpenAPI, sourcemaps, and telemetry

Defjs does not generate or sync a second OpenAPI contract. If OpenAPI is already authoritative, keep it and add runtime validation at the app boundary. For a new service, endpoint definitions and Structs can be the direct wire contract — no second source of truth.

`withOpenTelemetryServer(...)` adds **outbound** Defjs instrumentation to a client. It does not initialize an OpenTelemetry SDK. `tracer` is required, `meter` is optional, all three transports are enabled by default, and WebSocket query propagation is disabled by default. Keep operation names static and low-cardinality. Review propagation, hooks, URLs, headers, payloads, causes, and retention as potentially sensitive.

Sourcemaps are a deployment decision, not a Defjs behavior. A public map with `sourcesContent` exposes source; a hidden map still contains source and paths; disabling maps removes source-level symbolication. Treat private maps as deployable debugging artifacts with explicit access and retention rules.

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [Test with a local Fetch handle](../recipes/test-with-handle.md)
