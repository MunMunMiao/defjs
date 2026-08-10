---
title: Design Decisions
description: Why Defjs uses explicit clients, transport-specific tuples, execute-time lifecycle options, projection-based builds, and observers.
---

# Design Decisions

This page explains the reasoning behind the current API. The reference pages describe the fields and defaults.

## Explicit Clients

Defjs has no default process-wide client. `createClient(...)` makes ownership visible at the call site and lets an application create different clients for different endpoints, credentials, tests, or request scopes.

That isolation has limits. Interceptors and option callbacks can close over shared application state, so two client objects are not automatically isolated from everything around them. `setErrorMap(...)` is also process-global. Server code should create request-scoped clients whenever options or closures contain request, user, tenant, cookie, or authorization data.

An explicit client also makes resource ownership easier to discuss, but the client is not a resource manager. It does not track or dispose active HTTP requests, SSE handles, or WebSocket sessions.

## Transport-Specific Tuples

All supported commands use an error-first three-item tuple, but the third item keeps its transport meaning:

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

This avoids collapsing an HTTP response wrapper, an SSE startup-open snapshot, and a WebSocket startup-connection snapshot into one vague abstraction. The second item follows the same rule: HTTP returns decoded data, SSE returns a logical stream handle, and WebSocket returns a logical session.

The tuple makes expected startup failures explicit without forcing exception-based control flow. It is not a promise that arbitrary interceptors, callbacks, listeners, or unsupported values can never reject or throw.

## Lifecycle Options Belong to Execution

Endpoint definitions describe stable wire contracts and own bounded transport queue limits. Cancellation, timeout, heartbeat, and reconnect choices belong to the execution that owns the work.

HTTP and SSE accept cancellation options at execution time. WebSocket also accepts per-execution `beforeConnect`, heartbeat, reconnect, and protocol options. Client options provide reusable defaults where the transport supports them; WebSocket incoming and outgoing capacities remain endpoint-owned.

This split keeps a command reusable. A background job and an interactive screen can execute the same command with different lifetimes without redefining its path or message schema.

## `build` Uses Projections

Custom `build(request, input)` receives a declarative binding view derived from the input Struct. It has no access to caller runtime values.

The view records how source fields map to path, query, headers, and body targets. That model supports field projection, explicit wire keys, and one-to-one array projection. It deliberately prevents value-dependent branching, arbitrary transforms, and injected literal projection values.

This restriction keeps request construction tied to declared Struct fields. Application-level normalization and business validation should happen before creating a command. See [Commands](../core/commands.md) for the supported projection forms.

## Observers Do Not Own Control Flow

SSE `onInvalidEvent` observes dropped events. Thrown errors and rejected promises are isolated from stream control flow, so processing continues; an async observer is still awaited and can delay later messages.

WebSocket state and runtime-error listeners are observers too. Thrown errors and rejected promises are isolated: state-listener failures are forwarded to runtime-error listeners, runtime-error-listener failures are sent to global `reportError` when available, and remaining listeners and lifecycle work continue.

Use the returned handle or session for lifecycle decisions. Use observers for bounded logging, metrics, or state updates, and remove them when their owner is disposed.

## Related Reference

- [Client](../core/client.md) documents option composition and client scope.
- [Errors](../core/errors.md) documents tuple failures and response availability.
- [SSE](../core/sse.md) and [WebSocket](../core/web-socket.md) document logical handles, physical attempts, and terminal close.
