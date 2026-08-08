# Low-Cardinality HTTP Metrics for Inventory Reservations

## Problem

An inventory service records reservation latency, completion status, and active work. Labels derived from full URLs or SKUs create unbounded time series, while releasing active work only on success leaves the gauge incorrect after failures.

The business operation should supply one reviewed operation name. The interceptor should record bounded completion fields and decrement active work in `finally`.

## Scenario

The worker reserves `SKU-AVAILABLE` through `POST https://inventory.invalid/v1/inventory/reservations`. A local fixture returns reservation `reservation-1042`. The business operation attaches `inventory.reserve`, and a deterministic clock produces a 12 ms completion metric with status `200`.

The local sink also exposes the active value after the request has settled.

## Approach

Wrap the typed reservation operation with a stable operation label, balance the active gauge in `finally`, and record status and duration through an injected deterministic clock.

## Source map

- [`src/index.ts`](./src/index.ts): The request definition, metric types, interceptor, business operation, fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-observability-http-metrics start
```

## Expected result

```text
{"activeRequests":0,"metric":{"durationMs":12,"operation":"inventory.reserve","status":"200"},"reservation":{"reservationId":"reservation-1042"}}
```

`metric` contains the bounded operation, HTTP status, and deterministic elapsed time. `activeRequests: 0` shows that the interceptor released the request before returning the business result.

## Key points

- The context token gives ordinary TypeScript callers the reviewed `inventory.reserve | unknown` label union; untyped inputs still need boundary validation.
- Keep active acquisition and release in the same interceptor lifecycle.
- A transport exception retains the bounded `transport` classification in the implementation.
- Use a monotonic clock for elapsed duration in production.

## Production notes

Map completion to a counter and histogram, and active work to an up/down counter or gauge with documented process semantics. Extend operation names only through review, cap every additional dimension, and configure backend units, buckets, deployment labels, and exporter failure policy explicitly.

## Inspiration

- [http4s client metrics middleware](https://github.com/http4s/http4s/blob/ee37bc0856ff1f0d5b5868260459021dbba2251d/client/shared/src/main/scala/org/http4s/client/middleware/Metrics.scala#L101-L180) is the retained official source for timing outcomes and guaranteeing active-request decrement during resource release. Defjs expresses the lifecycle in an HTTP interceptor; http4s effect types, classifiers, and metrics backends are excluded.
- [OpenTelemetry HTTP client metrics semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/) define request-duration instruments and bounded HTTP attributes. This example adopts duration and status meaning while adding an application-owned operation label; OTel instruments, standard attribute names, exporters, views, and exemplars remain outside this small sink.
