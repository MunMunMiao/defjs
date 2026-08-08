# Rate-Limit Delay Budget for Export Scheduling

## Problem

An export scheduler asks for capacity in `us-east`, but the provider responds with `429` and `Retry-After: 120`. Sleeping a worker for an arbitrary server value wastes concurrency, while silently shortening the delay could call before the provider permits it.

The request operation should perform no retry or sleep. It should return a delay bounded to the scheduler's 60000 ms horizon and preserve whether the provider requested more.

## Scenario

The local provider returns `429 {"code":"export_quota_exhausted"}` with `Retry-After: 120`. `readCapacityDecision` converts that response into a quota decision with `retryAfterMs: 60000` and `exceededBudget: true`. No second request or timer is created.

## Approach

Classify the typed `429`, parse and cap `Retry-After` against the caller budget, and return scheduling metadata without sleeping, retrying, or creating a timer.

## Source map

- [`src/index.ts`](./src/index.ts): Capacity request, delay-budget decision, local fixture, and runner.

## Run

From the repository root:

```sh
pnpm --silent --filter @defjs/example-resilience-rate-limit-budget start
```

## Expected result

```text
{"kind":"quota-exhausted","exceededBudget":true,"retryAfterMs":60000}
```

The bounded value is the local scheduling horizon. `exceededBudget: true` preserves that the provider requested a longer wait; it is not permission to retry after 60000 ms.

## Key points

- `429` is a scheduling signal here, not a request-layer retry instruction.
- Missing or unparseable delay metadata remains `null` in the operation's decision.
- Actual rescheduling belongs to a durable scheduler rather than an inline timer.

## Production notes

Persist the provider's not-before time or park the job when the requested delay exceeds the local horizon. Scope quota decisions by the provider's credential, tenant, region, and endpoint rules, and bound total job age and attempts.

## Inspiration

- [RFC 9110 section 10.2.3, Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) defines delta-seconds and HTTP-date syntax.
- [RFC 6585 section 4, 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) defines `429` and permits `Retry-After`.
- [Octokit throttling implementation](https://github.com/octokit/plugin-throttling.js/blob/0c6f81f4d6fbb3d2a35a5752443354a00c4269c2/src/index.ts#L139-L183) is the retained client reference for interpreting rate-limit metadata and deciding whether to retry.
