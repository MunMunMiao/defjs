# Bounded SSE Queue for Cold-Room Readings

## Problem

A current-state cold-room monitor can briefly fall behind its SSE producer. Retaining every stale temperature in an unbounded queue wastes memory when the newest readings are the useful ones.

The monitor keeps at most two validated readings and drops the oldest value on overflow.

## Scenario

The local cold-room response emits `18`, `19`, and `20` degrees before the consumer drains the finite stream. With `maxSize: 2` and `overflow: 'drop-oldest'`, the retained queue contains `19` and `20` in source order.

## Approach

Configure a two-event queue with `drop-oldest`, let the finite producer enqueue three validated readings before draining, and preserve the retained readings in source order.

## Source map

- [`src/index.ts`](./src/index.ts): Temperature stream definition, queue configuration, catch-up operation, local fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-bounded-queue start
```

Execution is local and offline. Waiting for finite EOF makes the overflow deterministic without sleeps.

## Expected result

```text
{"readings":[19,20]}
```

The oldest reading is discarded once the third event enters the two-slot queue; the surviving readings keep their original order.

## Key points

- The `temperature-celsius` switch branch receives `event.data` as a number because that event declares `struct.number()`.
- `drop-oldest` favors freshness and is intentionally lossy.
- Audit or safety-critical consumers need durable delivery instead of this current-state policy.

## Production notes

Choose capacity from event rate, consumer pauses, and memory cost. Track overflow outside high-cardinality labels, and configure parser limits, reconnects, cancellation, and shutdown separately.

## Inspiration

- [Defjs SSE queue contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/sse/transport/event_stream.ts#L48-L64) is the authoritative project source for `maxSize` and the supported overflow policies.
