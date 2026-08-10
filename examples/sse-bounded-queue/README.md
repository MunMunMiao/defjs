# Bounded SSE Queue for Cold-Room Readings

## Problem

A cold-room monitor can briefly fall behind its SSE producer. Retaining every temperature in an unbounded queue lets a slow consumer exhaust memory.

The endpoint owns a two-event queue limit. Overflow is terminal so the application can reconnect from a durable cursor or raise an alert instead of silently losing a reading.

## Scenario

The local cold-room response emits `18`, `19`, and `20` degrees before the consumer drains the finite stream. With `maxQueueSize: 2`, the third event exceeds the endpoint-owned limit and closes the logical stream with `error`.

## Approach

Declare a two-event queue on the stream definition, let the finite producer enqueue three validated readings before draining, and observe the deterministic terminal error.

## Source map

- [`src/index.ts`](./src/index.ts): Temperature stream definition, endpoint-owned limits, overflow observer, local fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-bounded-queue start
```

Execution is local and offline. Waiting for finite EOF makes the overflow deterministic without sleeps.

## Expected result

```text
{"terminal":"error"}
```

The third event fails the bounded queue. No reading is silently discarded.

## Key points

- The `temperature-celsius` switch branch receives `event.data` as a number because that event declares `struct.number()`.
- `maxQueueSize` belongs to the event-stream definition because the endpoint owner knows its event rate and recovery contract.
- Queue overflow is fatal; lossy freshness policies belong in an explicit application-level projection, not the generic transport.

## Production notes

Choose capacity from event rate, consumer pauses, and memory cost. Track overflow outside high-cardinality labels, and pair reconnect with a durable replay cursor when loss is unacceptable.

## Inspiration

- [Defjs SSE queue contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/sse/transport/event_stream.ts#L48-L64) is the authoritative project source for endpoint-owned `maxQueueSize` and fatal overflow.
