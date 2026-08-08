# Bounded Fulfillment Read Concurrency

## Problem

A fulfillment dashboard reads several order states at once. `Promise.all(orderIds.map(read))` makes input size equal transport concurrency, while collecting responses as they finish can change their association with the input order.

The application needs a small worker pool and index-owned result slots around typed Defjs reads.

## Scenario

The business batch contains `order-1042`, `order-1043`, and `order-1044`. Two workers start the first pair. The fixture holds `order-1042` until a free worker starts `order-1044`, so the third request cannot become active before a slot is available.

The returned array remains in input order and the local fixture observes at most two active requests.

## Approach

Run the three independent fulfillment commands with two workers, retain input indexes, and use a barrier that makes the concurrency ceiling observable without relying on timing.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported worker pool, deterministic Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-workflow-bounded-concurrency start
```

## Expected result

```text
{"results":[{"orderId":"order-1042","state":"packed"},{"orderId":"order-1043","state":"shipped"},{"orderId":"order-1044","state":"picking"}],"maxActive":2}
```

`results` preserves caller order, while `maxActive` shows that only two Defjs reads overlapped.

## Key points

- Queue length and active transport concurrency are separate concerns.
- Input indexes provide stable result ownership even when requests settle independently.

## Production notes

Choose the worker limit from provider quotas and connection capacity. Add cancellation and failure-settlement policy when the caller owns long-lived batches.

## Inspiration

- [Laravel HTTP client concurrent request pools](https://github.com/laravel/docs/blob/b0b1c3e17c715880e0c380cd30061da6ca952c9d/http-client.md#L506-L577) documents grouping independent HTTP requests and collecting keyed responses.
- [ECMAScript `Promise.allSettled`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.allsettled) specifies waiting for every input promise to settle, a useful extension when failure-triggered sibling cleanup is required.
