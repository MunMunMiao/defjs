---
'@defjs/core': minor
'@defjs/opentelemetry-server': minor
'@defjs/react': minor
'@defjs/vue': minor
---

Improve runtime safety, type inference, transport ownership, framework injection, observability, documentation, and package consumption.

- Make `StructError.format()` and `flatten()` prototype-safe; correlate declared HTTP status errors with their decoded bodies; preserve inline output literals without `as const`; and allow all-optional path, query, and header sections to be omitted.
- Close SSE streams when their iterator returns, expose stable terminal SSE error codes, add static endpoint operation identities, and publish an additive `@defjs/core/http` client entry that excludes realtime implementations.
- Require callers to provide an existing client to the React provider and Vue plugin, keeping client creation and lifetime outside the framework adapters.
- Pass the original request to OpenTelemetry response hooks and use explicit operation identities for low-cardinality span names, attributes, and metrics.
- Correct the bundled 204 response contract and ship the updated executable lifecycle, reliability, diagnostics, runtime, and package-consumer guidance.
