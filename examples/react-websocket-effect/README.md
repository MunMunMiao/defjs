# React-Owned WebSocket Shipment Status

## Problem

A warehouse screen watches shipment `ship-204`. A WebSocket started by an effect must stop delivering updates and close when that effect leaves the tree; otherwise route changes can leave a live session behind.

## Scenario

`ShipmentStatusEffect` executes `wss://operations.fixture.invalid/v1/shipments/ship-204/status`. The local WebSocket sends one validated status. Unmount aborts startup or closes an acquired session, while the receive task's `finally` closes idempotently and awaits `session.closed` even if the callback throws.

The fixture supplies only the browser WebSocket mechanics needed for deterministic local execution.

## Approach

Bind socket startup, receive iteration, callbacks, and close to one React effect. The runner sends one typed status, then unmounts and awaits the effect-owned session closure.

## Source map

- [`src/index.ts`](./src/index.ts): Socket definition, effect-owned business operation, and runner.
- [`src/fixture.ts`](./src/fixture.ts): Minimal EventTarget WebSocket with explicit open, JSON message, and close events.
- [`src/renderer.ts`](./src/renderer.ts): Minimal React mount/unmount adapter and act-global cleanup.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-react-websocket-effect start
```

Execution is deterministic, local, offline, and opens no network listener.

## Expected result

```text
{"type":"shipment-status","shipmentId":"ship-204","status":"loaded"}
```

Only the Struct-validated shipment status reaches the business callback. The runner waits for the receive task's public-session cleanup before output.

## Key points

- One committed effect owns one session lifetime.
- The `AbortSignal` covers connection startup, while the receive task owns close and `session.closed` after acquisition.
- Callback failure passes through the same `finally` cleanup before `onError` runs.
- The receive iterator yields typed messages from the public Defjs session API.

## Production notes

Use the platform WebSocket at the operations origin and keep credentials scoped to the shipment service. Add reconnect, heartbeat, queue limits, and telemetry as explicit production policies rather than effect-lifetime concerns.

## Inspiration

- [React effect lifecycle](https://github.com/reactjs/react.dev/blob/7b6c3ceb9dd97249e9dce4a8a94e61aed6424698/src/content/reference/react/useEffect.md#L77-L121) is the official source for cleanup before replacement and after unmount.
- [Defjs WebSocket session contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/web_socket/web_socket.ts#L135-L143) defines `receive`, `close`, and `closed`.
- [RFC 6455, Section 7.1.2](https://www.rfc-editor.org/rfc/rfc6455#section-7.1.2) defines the WebSocket closing handshake.
