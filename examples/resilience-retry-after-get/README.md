# Bounded Retry-After for Inventory Reads

## Problem

Checkout reads inventory while the index for `SKU-482` is rebuilding. Returning the first `503` immediately loses a cheap recovery opportunity, while an unbounded retry loop can hold a worker indefinitely or amplify an outage.

The client should replay one safe read only when `429` or `503` includes an understood `Retry-After`, and any requested delay must stay within 1000 ms.

## Scenario

The local fixture first returns `503 {"code":"inventory_rebuilding"}` with `Retry-After: 0`. The Defjs HTTP interceptor waits through an injected deterministic function and replays the `GET` once. The second response is `200 {"available":7,"sku":"SKU-482"}`.

## Approach

Apply one bounded safe-read interceptor that understands `Retry-After`, inject a deterministic wait, and replay the `GET` once after the local `503` response.

## Source map

- [`src/index.ts`](./src/index.ts): Request contract, bounded retry interceptor, business read, local fixture, and runner.

## Run

From the repository root:

```sh
pnpm --silent --filter @defjs/example-resilience-retry-after-get start
```

## Expected result

```text
{"sku":"SKU-482","available":7,"attempts":2}
```

The returned inventory comes from the recovered `200`; `attempts: 2` shows that the client made one bounded replay.

## Key points

- Retry eligibility belongs to reviewed method and status policy, not to every failed request.
- `Retry-After` remains server input and is bounded before the client waits.
- The injected wait keeps the example deterministic; the default uses an abort-aware Node timer.

## Production notes

Scope the interceptor to replay-safe operations, add jitter and an overall deadline, and record retry telemetry without credentials. Mutation retries require a separate idempotency design.

## Inspiration

- [RFC 9110 section 10.2.3, Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) defines delta-seconds and HTTP-date forms.
- [RFC 9110 section 9.2.1, Safe Methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1) identifies `GET` and `HEAD` as safe methods.
- [go-retryablehttp retry policy](https://github.com/hashicorp/go-retryablehttp/blob/fd004584a46724fae09e2f21d7c382e15c893f42/client.go#L470-L565) is the retained implementation reference for status-based retry and server delay handling.
