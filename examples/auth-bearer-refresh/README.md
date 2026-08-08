# Single-Flight Bearer Refresh for Tenant Invoice Reads

## Problem

A billing worker keeps a Defjs client alive while its access token rotates. When concurrent invoice reads receive `401`, starting one refresh per caller wastes token-endpoint capacity and can publish competing credentials.

The example keeps the Bearer token and refresh promise inside an HTTP interceptor. Invoice code only asks for typed aging data; it does not attach credentials or retry requests itself.

## Scenario

Two callers request `GET https://billing.invalid/v1/tenants/northwind/invoice-aging` with `billing-token-v1`. The local billing service returns `401 {"code":"expired_token"}` for both stale requests. A Promise barrier ensures both callers observe expiry before one shared refresh publishes `billing-token-v2`; each caller then replays once and receives the same typed summary.

The token values and service are deterministic fixtures. The command performs no external traffic.

## Approach

Recognize the raw expired-token `401` challenge inside the replay interceptor, coordinate refresh through one credential-scoped promise, and let Defjs validate the successful replayed invoice response.

## Source map

- [`src/index.ts`](./src/index.ts): Request contract, invoice operation, single-flight Bearer interceptor, deterministic local service, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-bearer-refresh start
```

## Expected result

```text
{"overdueInvoices":7,"refreshes":1}
```

The overdue count is the shared business result. `refreshes: 1` shows that both expired reads joined one scoped refresh flight; no Bearer value is printed.

## Key points

- Key refresh flights by the failed credential, audience, and tenant.
- Reuse a newly published credential when a late `401` arrives instead of starting another refresh.
- Replay only safe reads after the expected `expired_token` challenge, and let each caller cancel its own wait without cancelling shared refresh work.

## Production notes

Replace the fixture token source with a concurrency-safe provider that publishes refreshed credentials atomically. Include permission scope in the flight key when it can vary, keep the client pinned to its HTTPS resource origin, redact credentials, and bound refresh latency. If the client gains mutation commands, do not replay them without an explicit idempotency policy.

## Inspiration

- [RFC 6750, Authorization Request Header Field](https://www.rfc-editor.org/rfc/rfc6750.html#section-2.1) defines `Authorization: Bearer <token>` and the possession risk of Bearer credentials. Defjs adds the header in an HTTP interceptor; token issuance, validation, storage, and resource authorization remain external.
- [Google Auth `HttpCredentialsAdapter`](https://github.com/googleapis/google-auth-library-java/blob/9ac2d4340ebc6a8582b898e97f65aeed3c1776d6/oauth2_http/java/com/google/auth/http/HttpCredentialsAdapter.java#L113-L153) is the retained official implementation reference for invalidating credentials and retrying an eligible request after an authentication challenge. This example expresses one conservative retry through a Defjs interceptor.
- [Go OAuth2 `reuseTokenSource`](https://github.com/golang/oauth2/blob/4d954e69a88d9e1ccb8439f8d5b6cbef230c4ef9/oauth2.go#L293-L320) serializes token acquisition around cached state. The example applies that single-flight idea to one local credential source.
- [RFC 9110, Safe Methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1) defines retrieval methods as safe. The demonstrated command is a `GET`; mutation replay remains application-owned.
