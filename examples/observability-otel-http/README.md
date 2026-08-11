# OTel HTTP Trace for a Fulfillment Job

## Problem

A fulfillment worker reads a warehouse job while operators need visibility into the downstream HTTP call. Telemetry providers should be owned by the application lifecycle, not installed globally during module import or abandoned before completed spans are processed.

The Defjs OTel interceptor should inject W3C trace context and create a client span around the typed request. The runner should close its local providers after that work settles.

## Scenario

The worker executes a statically defined `fulfillment.job.read` operation. A local Fetch fixture observes a `traceparent` header and returns the typed ready-for-pick job. The in-memory exporter receives a `GET fulfillment.job.read` span with `defjs.operation` set to that low-cardinality identity.

The fixture providers are isolated, export nothing externally, and shut down in `finally`.

## Approach

Create isolated telemetry providers inside `main`, instrument only HTTP, execute the typed job read, inspect the finished in-memory span, and shut the providers down in `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): The request, business operation, local Fetch fixture, OTel policy, span read, and lifecycle owner.
- [`src/telemetry.ts`](./src/telemetry.ts): Minimal in-memory tracer and meter provider setup with shutdown.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-observability-otel-http start
```

## Expected result

```text
{"job":{"jobId":"job-204","status":"ready-for-pick"},"span":{"name":"GET fulfillment.job.read","operation":"fulfillment.job.read"},"traceparentInjected":true}
```

`job` is the Struct-validated response. `span` contains only the static operation identity read from the local in-memory exporter, and `traceparentInjected` reflects the header observed by the Fetch fixture. Random trace identifiers and resolved URLs are not emitted.

## Key points

- Provider construction and shutdown belong to an application lifecycle owner.
- Defjs instrumentation can use caller-supplied tracer, meter, and propagator instances.
- Set `operation` statically on the endpoint definition; never derive it from a resolved URL or path containing identifiers.
- Trace identifiers should not become metric dimensions or deterministic fixture output.
- Transport tracing and application response validation remain separate concerns.

## Production notes

Create providers once per application scope, then configure resources, sampling, processors, metric readers, OTLP exporters, URL redaction, and shutdown hooks. Accept parent context only from trusted work. Do not copy resolved URLs into custom attributes or logs; configure authentication, TLS, deadlines, retries, and response policy independently from tracing.

## Inspiration

- [OpenTelemetry Undici instrumentation](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/27e172a9e0d549559056ccd58f27d13467454156/packages/instrumentation-undici/src/undici.ts#L294-L345) is the retained official implementation reference for creating an outbound span, injecting propagation headers, recording response status, and ending around transport. Defjs expresses those responsibilities in `withOpenTelemetryServer`; Undici hooks, diagnostics channels, and automatic global registration are excluded.
- [OpenTelemetry HTTP span semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/) define client span attributes and HTTP status mapping. The adapter supplies transport attributes and status meaning; the endpoint supplies its static operation identity, while application response parsing and exporter configuration remain outside this runner.
- [W3C Trace Context, `traceparent`](https://www.w3.org/TR/trace-context/#traceparent-header) defines the version, trace ID, parent ID, and flags carried in the header. The example reports only whether Defjs injected the carrier; trust decisions, sampling, and cross-service server spans are deployment-owned.
