# Vue Scope-Owned WebSocket Fraud Review

## Problem

A fraud analyst watches live decisions for review `review-73`. A WebSocket started in a Vue scope must stop delivering decisions and close when that scope is disposed; otherwise navigation can leave a live review session behind.

## Scenario

`ReviewDecisionScope` executes `wss://fraud.fixture.invalid/v1/fraud/reviews/review-73/decisions`. The local WebSocket sends one validated decision. Scope disposal aborts startup or closes an acquired session, while the receive task's `finally` closes idempotently and awaits `session.closed` even if the callback throws.

The fixture supplies only the host and WebSocket mechanics needed for deterministic local execution.

## Approach

Register disposal before socket startup, keep callbacks behind the active scope, deliver one typed decision, and unmount plus await session closure before reading the result.

## Source map

- [`src/index.ts`](./src/index.ts): Socket definition, scope-owned business component, and runner.
- [`src/fixture.ts`](./src/fixture.ts): Minimal EventTarget WebSocket with explicit open, JSON message, and close events.
- [`src/renderer.ts`](./src/renderer.ts): Minimal Vue host renderer for local scope lifecycle.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-vue-websocket-scope start
```

Execution is deterministic, local, offline, and opens no network listener.

## Expected result

```text
{"type":"review-decision","caseId":"review-73","decision":"hold"}
```

Only the Struct-validated decision reaches the business callback. The runner waits for the receive task's public-session cleanup before output.

## Key points

- Register `onScopeDispose` synchronously during `setup()`.
- The scope's `AbortSignal` covers connection startup, while the receive task owns close and `session.closed` after acquisition.
- Callback failure passes through the same `finally` cleanup before `onError` runs.
- The receive iterator yields typed decisions from the public Defjs session API.

## Production notes

Use the platform WebSocket at the fraud-service origin and scope credentials to the active review. Add reconnect, heartbeat, queue limits, and telemetry as explicit production policies outside the basic scope lifetime.

## Inspiration

- [Vue `onScopeDispose`](https://github.com/vuejs/docs/blob/33ff72af9008c68e05360de34ef3e96e74bf70c9/src/api/reactivity-advanced.md#L333-L345) documents disposal registration in the current effect scope.
- [Defjs WebSocket session contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/web_socket/web_socket.ts#L135-L143) defines `receive`, `close`, and `closed`.
- [RFC 6455, Section 7.1.2](https://www.rfc-editor.org/rfc/rfc6455#section-7.1.2) defines the WebSocket closing handshake.
