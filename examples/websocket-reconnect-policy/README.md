# Reviewed WebSocket Reconnect Policy for Inventory Availability

## Problem

A fulfillment console follows live inventory while a gateway may restart. Reconnecting after every close can retry a `1008` policy refusal, while never reconnecting abandons recoverable `1012` service restarts.

The client should permit one reconnect only for reviewed transient close codes.

## Scenario

The `fc-recovered` socket opens and closes with the reviewed transient code `1012`. One replacement socket then returns an `inventory-ready` message. The configured policy would not reconnect for other close codes.

## Approach

Reconnect only for the reviewed transient close codes, cap the policy at one replacement, and return the first validated inventory-ready message from the logical session.

## Source map

- [`src/index.ts`](./src/index.ts): Inventory definition, business operation, reconnect policy, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal physical-attempt socket and attempt counter.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-reconnect-policy start
```

Execution is local and offline. The policy uses one immediate reconnect and all acquired sessions are awaited.

## Expected result

```text
{"attempts":2,"availability":{"type":"inventory-ready","centerId":"fc-recovered","status":"available"}}
```

Two attempts are the initial socket and its one approved replacement; the availability is the typed result from that logical session.

## Key points

- Attempt limits and close-code eligibility both have to approve a reconnect.
- A logical Defjs session can span more than one physical WebSocket.
- `session.connection.generation` increments on each successful physical open and lets owners restore only active replayable subscriptions.
- Transport reconnect does not make business mutations replay-safe or idempotent.

## Production notes

Review retryable close codes with the service team. Add jitter, capped delays, an overall deadline, credential refresh where required, and bounded incoming and outgoing queues. Close and await the logical session during shutdown or owner disposal.

## Inspiration

- [graphql-ws close policy](https://github.com/enisdenjo/graphql-ws/blob/af4f5c9df60d6b73667d7d90ad1b1c851d22b482/src/client.ts#L807-L847) is the retained implementation reference for distinguishing fatal and retryable closures.
- [RFC 6455, Section 7.2.3](https://www.rfc-editor.org/rfc/rfc6455#section-7.2.3) recommends delayed recovery after abnormal closure to avoid retry storms.
