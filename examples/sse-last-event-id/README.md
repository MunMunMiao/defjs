# Last-Event-ID Replay for Shipment Updates

## Problem

A shipment feed can disconnect after the consumer has received an event. Reconnecting without a parsed cursor gives the server no reliable replay position, while reconnecting with the latest SSE `id` should carry that exact value in `Last-Event-ID`.

The client permits one reconnect only when Defjs has a non-empty last event ID.

## Scenario

The runner opens one local `shipment-104` feed. It emits ID `shipment-104:17` with state `packed` and then disconnects. Defjs allows its single reconnect because a cursor exists and sends `Last-Event-ID: shipment-104:17`; the fixture responds with ID 18 and state `in-transit`.

## Approach

Allow one reconnect only after Defjs has parsed a non-empty event ID, then inspect the second request to prove it carries that cursor in `Last-Event-ID`.

## Source map

- [`src/index.ts`](./src/index.ts): Shipment stream definition, cursor-aware client policy, business operation, protocol fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-last-event-id start
```

Execution is local and offline. The logical stream settles and is closed before exit.

## Expected result

```text
{"replayHeader":"shipment-104:17","states":["packed","in-transit"]}
```

The states preserve event order across the physical request carrying the parsed replay cursor.

## Key points

- Reconnect uses Defjs's latest parsed non-empty `id:` field; it may advance before payload validation or business commit.
- The first request has no cursor; Defjs adds `Last-Event-ID` only after parsing one.
- Pass the raw shipment ID to the path input; Defjs encodes each path segment exactly once.
- A cursor supports replay continuity but does not by itself guarantee exactly-once processing.

## Production notes

Persist a cursor only after the corresponding shipment update commits, authorize replay per tenant, and make projection writes idempotent. Define behavior for expired cursors and reconciliation gaps.

## Inspiration

- [HTML Living Standard, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events) defines the last-event-ID buffer, the `id` field, and the `Last-Event-ID` request header used for reconnection.
- [Mercure subscriber replay handling](https://github.com/dunglas/mercure/blob/7389b66f6fabdc1e157612e613ba6c3bacc75c30/subscribe.go#L385-L418) is the retained implementation reference for accepting a last event ID and replaying from history.
