# WebSocket Subprotocol Precedence for Inventory Rollouts

## Problem

A warehouse dashboard supports endpoint protocol `inventory.v1`, while its deployed client defaults to `inventory.v2` and one rollout operation requires `inventory.v3`. Merging those values could let the server select an older schema than the operation expects.

The request-scoped execute option must replace the client default, which otherwise replaces the endpoint fallback.

## Scenario

The endpoint definition declares `inventory.v1`, the client configures `inventory.v2`, and `negotiateInventoryRollout` executes with `inventory.v3`. A local WebSocket fixture records the protocols passed to its native constructor and selects `inventory.v3`.

The constructor receives only `inventory.v3`, and Defjs exposes the same value as the negotiated protocol.

## Approach

Set endpoint, client, and execution protocol choices at their native configuration layers, then inspect the constructor offer and negotiated protocol to show execution-level replacement.

## Source map

- [`src/index.ts`](./src/index.ts): Three configuration layers, rollout operation, cleanup, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal constructor and subprotocol negotiation fixture.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-subprotocol-precedence start
```

Execution is local and offline. The simulated closing handshake settles before the process exits.

## Expected result

```text
{"negotiatedProtocol":"inventory.v3","offeredProtocols":["inventory.v3"]}
```

Only the execute-level protocol reaches the constructor, so lower-precedence lists are replaced rather than merged.

## Key points

- Protocol precedence is execute options, then client options, then endpoint protocols.
- Array order matters only within the winning configuration layer.
- The negotiated protocol versions the wire contract; it is not an authorization mechanism.

## Production notes

Use a secure WebSocket endpoint and keep protocol tokens aligned with their frame codecs. Roll out an execute-level override only where the server supports it, observe handshake rejection, and handle downgrade as a separate explicit operation.

## Inspiration

- [Defjs WebSocket protocol precedence](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/web_socket/web_socket.ts#L341-L347) is the authoritative project source for execute, client, and endpoint ordering.
- [RFC 6455, Section 4.2.2](https://www.rfc-editor.org/rfc/rfc6455#section-4.2.2) requires the server to select at most one protocol offered by the client.
