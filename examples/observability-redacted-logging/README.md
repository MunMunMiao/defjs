# Redacted HTTP Logging for Customer Lookups

## Problem

A support service looks up customers by email using a Bearer credential. Logging the full URL, headers, or request object would expose the email and token to a system with broader access and retention.

The interceptor should construct a new log entry from an explicit allowlist: method, fixed operation name, status classification, and elapsed duration.

## Scenario

The runner sends `alina.chen@example.invalid` and `Bearer fixture-customer-token` to a local customer fixture. The fixture reads the native URL and authorization header, then returns customer `customer-1042`. The logger emits only the fixed `customers.lookup` operation, method, status, and a deterministic 7 ms duration.

No external traffic or logger is used.

## Approach

Send the sensitive email and credential only to the local transport while the interceptor writes an explicit allowlist of operation, method, status, and deterministic duration.

## Source map

- [`src/index.ts`](./src/index.ts): The request definition, safe log schema, interceptor, business operation, local fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-observability-redacted-logging start
```

## Expected result

```text
{"customer":{"customerId":"customer-1042"},"log":{"durationMs":7,"method":"GET","operation":"customers.lookup","status":200}}
```

`customer` is the Struct-validated business response. `log` contains only the allowlisted operational metadata; the email, authorization header, URL, and error text are never copied into it.

## Key points

- Build logs from an allowlist instead of serializing a request and deleting known secrets.
- The context token gives ordinary TypeScript callers a bounded operation-name union; the interceptor's explicit allowlist remains the privacy boundary.
- Keep credentials, query values, bodies, correlation IDs, and raw errors outside routine request logs.
- Treat redacted operational logs as sensitive data in production.

## Production notes

Send `SafeRequestLog` to a structured sink with schema enforcement, access controls, retention limits, and tamper monitoring. Scrub exceptions in global reporters as well, because one interceptor cannot control every logging layer. Add fields only after data classification and review.

## Inspiration

- [Kubernetes client-go request logging transport](https://github.com/kubernetes/client-go/blob/32ce75a7d6bc6960fd048d3d1e3b34185418d8c8/transport/round_trippers.go#L372-L485) is the retained official source for request/response logging around transport and explicit header masking. Defjs adopts the transport-boundary placement but uses a stricter metadata allowlist; Kubernetes verbosity, curl rendering, body logging, and header policy are excluded.
- [OWASP Logging Cheat Sheet, data to exclude](https://github.com/OWASP/CheatSheetSeries/blob/7d1c2d3daf632206e8f2c685214c699ff8f11938/cheatsheets/Logging_Cheat_Sheet.md#L182-L210) identifies access tokens, session identifiers, sensitive personal data, and other secrets that should not be recorded directly. This example enforces omission in the Defjs interceptor; organization-wide classification, sanitization, retention, and monitoring remain operational responsibilities.
