# Circuit Breaker for Shipping Quotes

## Problem

A checkout worker keeps requesting a shipping quote while its carrier provider returns `503`. Continuing to dispatch every call adds load and latency during the outage. A breaker created per request would never retain enough failure history to open.

The quote reader therefore owns one circuit breaker alongside one Defjs client and counts transport failures plus the declared provider-outage response.

## Scenario

The local provider returns `503 {"code":"quote_provider_unavailable"}` for `order-734`. Three calls reach Fetch and satisfy the consecutive-failure threshold. The fourth call is rejected by Cockatiel before Fetch, leaving the upstream call count at three.

## Approach

Retain one Cockatiel breaker beside the client, classify only transport failures and declared `503` outages, and make repeated quote calls until the policy blocks transport.

## Source map

- [`src/index.ts`](./src/index.ts): Quote contract, outage classifier, client-scoped breaker, local fixture, and runner.

## Run

From the repository root:

```sh
pnpm --silent --filter @defjs/example-resilience-circuit-breaker start
```

## Expected result

```text
{"circuit":"open","upstreamCalls":3}
```

`circuit: "open"` is the fourth policy outcome. `upstreamCalls: 3` shows that the open circuit blocked that call before transport.

## Key points

- Breaker state must outlive one request but remain scoped to the dependency it represents.
- The classifier counts Defjs transport failures and only the explicitly declared `503` HTTP outage.
- Opening the circuit fails fast; it does not retry or synthesize a quote.

## Production notes

Choose thresholds and half-open timing from measured traffic and service objectives. Include only reviewed transport or status failures, propagate cancellation, and keep fallback pricing as an explicit business policy.

## Inspiration

- [Cockatiel circuit breaker implementation](https://github.com/connor4312/cockatiel/blob/f475a690eedbb9dc7e495b6e4b0f42105c195ec3/src/CircuitBreakerPolicy.ts#L255-L319) is the retained source for open, half-open, and blocked-call behavior.
- [Azure Architecture Center, Circuit Breaker pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker) describes failing fast while a remote dependency recovers.
