# Onion-Ordered Authentication, Retry, and Attempt Telemetry

## Problem

A warehouse dashboard reads stock while the inventory replica can briefly return `503`. Authentication should wrap the logical read once, retry should replay only its downstream chain, and attempt telemetry should wrap every physical Fetch call. A flat mental model hides those ownership boundaries and the reverse-order unwind.

The example uses one fixed replay for one declared `GET`. General retry classification, delays, token issuance, and telemetry export remain production concerns.

## Scenario

The client reads availability for `scanner-x2`. The local inventory fixture returns `503` on the first attempt and seven units on the second. An event trace records authentication, retry, per-attempt telemetry, Fetch, and the reverse unwind around that one successful operation.

## Approach

Compose authentication outside bounded safe-read retry and per-attempt telemetry, execute one transient `503` followed by `200`, and record entry and unwind order around Fetch.

## Source map

- [`src/index.ts`](./src/index.ts): Request contract, exported operation, three interceptors in registration order, scripted local transport, and event output.

## Run

From the repository root, with pnpm workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-interceptor-onion-order start
```

## Expected result

```text
{"events":["auth:before","retry:before","attempt:before","fetch:1","attempt:after","retry:replay","attempt:before","fetch:2","attempt:after","retry:after","auth:after"],"availability":{"sku":"scanner-x2","availableUnits":7}}
```

Authentication and retry each appear once around the logical operation. Attempt telemetry appears twice because retry invokes only the downstream portion of the chain. The runner performs no external traffic and exits after the successful response.

## Production notes

Use an audience-scoped token provider and reject redirects that could forward authorization. Expand retry with reviewed method and status rules, bounded delay, cancellation, and deadlines. Replace event labels with real per-attempt telemetry and close its provider at application shutdown.

## Inspiration

- [OpenTelemetry Tesla middleware](https://github.com/open-telemetry/opentelemetry-erlang-contrib/blob/aa917a10c34c65ef451b1df5dd957da0fcc2925f/instrumentation/opentelemetry_tesla/lib/middleware/opentelemetry_tesla_middleware.ex#L81-L119) is the existing official middleware source for starting observation before a downstream call and recording completion after it returns. This example adopts that wrapping shape as the innermost Defjs interceptor so retries create separate attempt boundaries; OpenTelemetry propagation, semantic attributes, timing, export, and provider lifecycle are deliberately not implemented.
- [RFC 9110, Safe Methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1) defines `GET` and `HEAD` as safe methods. This reduced example retries its one declared `GET` once; broader method eligibility, failure classification, backoff, idempotency keys, and replay of unsafe operations remain application-owned.
