# Owned WebSocket Lifecycle for Support Case Status

## Problem

A support workspace consumes case-status updates only while its component or worker scope is active. A detached async iterator can retain the socket and callback after that owner is gone.

One business operation should share the owner's abort signal, consume updates, and always close and await the session.

## Scenario

A local support socket emits one typed `case-status` update for `case-842` and otherwise remains open. The business callback records the assignment and aborts its owner.

That cancellation closes the fixture socket, ends iteration, and lets `consumeCaseStatus` finish its `finally` cleanup before returning the terminal `aborted` state.

## Approach

Give one operation ownership of the abort signal, receive iterator, callback, and terminal session. Aborting from the callback makes the operation close and await the socket before returning.

## Source map

- [`src/index.ts`](./src/index.ts): Status definition, owner-scoped operation, local execution, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal open WebSocket used to make owner cancellation end the session.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-owned-lifecycle start
```

Execution is local and offline. The process exits only after owner-triggered socket shutdown settles.

## Expected result

```text
{"status":{"type":"case-status","caseId":"case-842","status":"assigned"},"terminal":"aborted"}
```

The callback receives one validated update while its owner is active, and the owner cancellation supplies the terminal session state.

## Key points

- The operation owner controls the abort signal passed to Defjs.
- The receive iterator and business callback remain inside the same cleanup scope.
- Calling `close` is idempotent; awaiting `closed` defines completion.

## Production notes

Bind the controller to the real component, worker, or application scope. Add finite reconnect and deadline policy, bounded queues, and guards against callbacks mutating disposed state.

## Inspiration

- [Defjs WebSocket session contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/web_socket/web_socket.ts#L135-L143) is the authoritative project source for `receive`, `close`, `closed`, and session state.
- [DOM Standard, `AbortController`](https://dom.spec.whatwg.org/#interface-abortcontroller) defines owner-triggered cancellation and abort reasons.
- [RFC 6455, Section 7.1.2](https://www.rfc-editor.org/rfc/rfc6455#section-7.1.2) defines the WebSocket closing handshake as a lifecycle rather than a fire-and-forget call.
