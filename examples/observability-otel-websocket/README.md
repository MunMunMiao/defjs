# OTel WebSocket Span Without Query Propagation

## Problem

A browser-compatible WebSocket cannot attach an arbitrary `traceparent` header. Propagating trace context through the URL query can expose identifiers to proxy logs, dashboards, and copied connection URLs.

This client should keep a local WebSocket span while setting `queryPropagation: false`. The business operation must close the session and await terminal socket state before its telemetry owner shuts providers down.

## Scenario

The inventory client connects to `wss://inventory.invalid/v1/warehouses/sea-1/inventory`. A deterministic local socket emits native open, message, and close events. Defjs validates the stock envelope before `readInventorySnapshot` returns `{ "available": 18, "sku": "SKU-204" }`.

The captured socket URL has no query string. The finished `WebSocket` span contains `websocket.connected` and `websocket.closed`.

## Approach

Create private telemetry providers and a deterministic socket inside `main`, disable query propagation, consume one typed message, await session closure, and shut providers down in `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): The socket definition, business operation, OTel policy, output, and lifecycle owner.
- [`src/fixture.ts`](./src/fixture.ts): The local WebSocket-compatible open, message, and close mechanics.
- [`src/telemetry.ts`](./src/telemetry.ts): Minimal in-memory tracer and meter provider setup with shutdown.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-observability-otel-websocket start
```

## Expected result

```text
{"message":{"available":18,"sku":"SKU-204"},"socketUrl":"wss://inventory.invalid/v1/warehouses/sea-1/inventory","span":{"events":["websocket.connected","websocket.closed"],"name":"WebSocket"}}
```

`message` is the Struct-validated stock data. The query-free `socketUrl` shows the configured propagation policy, and the terminal span events show that tracing covered connection through clean closure.

## Key points

- Query propagation is an explicit data-exposure decision.
- Disabling it preserves local tracing but does not continue context through this handshake.
- The business operation owns the socket until `session.closed` settles.
- Provider shutdown follows terminal session state.

## Production notes

Choose propagation only after reviewing browser constraints and every place URLs are retained. Add authentication, reconnect limits, heartbeat deadlines, bounded queues, malformed-message handling, and coordinated shutdown. Close all sessions and await terminal promises before flushing application-owned providers.

## Inspiration

- [Defjs OTel WebSocket interceptor](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/opentelemetry-server/src/interceptor/web_socket.ts#L26-L111) is the retained authoritative implementation source for optional query injection, connected/terminal span events, and active-connection lifecycle. This runner exercises `queryPropagation: false` and clean closure through the public client; hooks, reconnect, metrics export, and errors are excluded.
- [MDN, WebSocket constructor](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket) documents the browser constructor's URL and optional subprotocol inputs, with no arbitrary request-header parameter. Defjs can adapt propagation to query parameters; this example rejects that tradeoff, while browser authentication and alternative application protocols remain application-owned.
- [W3C Trace Context, privacy and security considerations](https://www.w3.org/TR/trace-context/#privacy-of-traceparent-field) explains that trace identifiers can expose correlation information across systems. The example keeps them out of the WebSocket URL and stable output; organizational log controls, sampling, and trusted cross-service propagation remain operational responsibilities.
