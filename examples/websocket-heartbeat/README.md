# Correlated WebSocket Heartbeats for Dock Monitors

## Problem

An operations console can retain a WebSocket after an intermediary silently loses the network path. Sending application pings without an acknowledgement deadline leaves the monitor marked healthy indefinitely.

The session should accept only a typed pong for its active `monitorId` and close a silent connection after a bounded timeout.

## Scenario

Two local sessions monitor `dock-monitor-9`. The acknowledged fixture answers the first typed ping with a matching pong, allowing a second ping before it closes cleanly. The silent fixture sends no pong, so Defjs reports `WebSocket heartbeat timeout` and settles the logical session as an error.

The runner uses a 10 ms interval and 2 ms timeout so both paths finish locally without external traffic.

## Approach

Derive the outgoing ping type from its Struct map, consume Struct-decoded pongs with monitor correlation, and let acknowledged and silent operations await terminal socket state.

## Source map

- [`src/index.ts`](./src/index.ts): Heartbeat contract, monitor operation, two local outcomes, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal send, message, and close transport for local heartbeat execution.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-heartbeat start
```

Execution is local and offline. Both sessions await terminal close, which disposes their heartbeat timers.

## Expected result

```text
{"acknowledged":{"closeCode":1000,"pings":2},"silent":{"runtimeError":"WebSocket heartbeat timeout"}}
```

The matching pong clears the first deadline and permits another interval. The silent peer reaches the configured timeout and terminal close code.

## Key points

- Browser code sends heartbeat JSON data messages, not native WebSocket Ping control frames.
- `isAck` decides which typed incoming message clears the active deadline.
- Heartbeat failures are fatal and do not consult reconnect policy.
- Runtime-error observation and awaiting `session.closed` are separate lifecycle responsibilities.

## Production notes

Choose intervals from device latency, proxy idle limits, and browser timer behavior. Use a connection generation or nonce if delayed pongs could cross reconnect boundaries, and add bounded reconnect, queue, and owner deadline policies.

## Inspiration

- [graphql-ws client heartbeat handling](https://github.com/enisdenjo/graphql-ws/blob/af4f5c9df60d6b73667d7d90ad1b1c851d22b482/src/client.ts#L270-L303) is the retained implementation reference for application ping/pong handling and acknowledgement timeouts.
- [RFC 6455, Sections 5.5.2 and 5.5.3](https://www.rfc-editor.org/rfc/rfc6455#section-5.5.2) define native Ping and Pong control-frame semantics; this browser-facing example uses typed JSON data frames instead.
