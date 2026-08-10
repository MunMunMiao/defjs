# WebSocket Preparation Before Every Dispatch Connection

## Problem

A dispatch board relies on short-lived session state that must be refreshed before opening its WebSocket. Preparing only once lets a reconnect dial with stale state after a gateway restart.

The asynchronous prerequisite must complete before every physical constructor call in one logical session.

## Scenario

The local preparation increments a session generation. Generation 1 completes before the initial socket opens; that socket then closes with `1012`. Defjs runs preparation again before constructing the replacement, which emits a typed `ready` message carrying generation 2.

The fixture performs no external request and opens no listener.

## Approach

Run the async preparation hook before each physical constructor call, allow one reviewed reconnect, and consume the typed readiness message from the prepared replacement socket.

## Source map

- [`src/index.ts`](./src/index.ts): Readiness definition, business operation, `beforeConnect` configuration, reconnect, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal constructor/open fixture for two physical attempts.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-before-connect start
```

Execution is local and offline. The operation closes and awaits the replacement socket after readiness.

## Expected result

```text
{"preparations":2,"ready":{"type":"ready","sessionGeneration":2}}
```

Two preparations correspond to the initial dial and its one reconnect. The replacement reports the state prepared immediately before it was constructed.

## Key points

- `beforeConnect` receives `{ attempt, signal }` inside each physical attempt, not once per logical session.
- Defjs awaits the returned Promise before invoking the WebSocket constructor; abort and timeout race the hook and suppress late construction.
- The hook prepares prerequisites; the server still owns handshake authentication and authorization.

## Production notes

Use a bounded, cancellation-aware refresh operation whose result the WebSocket handshake actually consumes. Scope credentials to the expected secure origin and tenant, keep reconnect attempts finite, and close plus await the session during board disposal.

## Inspiration

- [Defjs connection loop and `beforeConnect`](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/web_socket/web_socket.ts#L341-L430) is the authoritative project source showing preparation inside every physical attempt.
- [WHATWG WebSockets, WebSocket constructor](https://websockets.spec.whatwg.org/#dom-websocket-websocket) defines construction as the action that begins establishing a connection.
