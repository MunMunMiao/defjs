# Rotating Bearer Authentication Interceptor

## Problem

A long-lived payroll client must use the current access token on every request. Capturing a header value when the client is created leaves later dispatches using stale credentials after rotation.

The example lets one HTTP interceptor read its token source at dispatch time while payroll business code remains unaware of authorization headers.

## Scenario

The client is created while token version `v1` is current, then the token rotates to `v2` before one `GET https://payroll.invalid/payroll/summary` dispatch. The interceptor validates that exact HTTPS request before reading the token, and the local fixture returns the February 2025 summary for 48 employees.

## Approach

Validate the request scheme, origin, method, and route before resolving the token at dispatch time. Reusing the client after rotation therefore sends the current token only to the payroll operation.

## Source map

- [`src/index.ts`](./src/index.ts): Payroll contract, summary operation, dispatch-time Bearer interceptor, rotating local fixture, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-bearer-interceptor start
```

The command performs one local dispatch and no external traffic.

## Expected result

```text
{"employeeCount":48,"period":"2025-02","tokenVersion":"v2"}
```

`tokenVersion` shows that dispatch read the rotated value after client creation. No Bearer value is emitted.

## Key points

- Read rotating credentials when the interceptor handles a dispatch, not in business call sites.
- Validate the HTTPS origin, method, route, and query before reading or attaching the credential.
- Output safe labels rather than token bytes.

## Production notes

Replace the mutable fixture value with a concurrency-safe token provider that validates scope and expiry before publication. Keep the payroll endpoint on HTTPS, prevent credential-forwarding redirects, redact headers from logs and traces, and coordinate refresh separately from request replay.

## Inspiration

- [RFC 6750, Authorization Request Header Field](https://www.rfc-editor.org/rfc/rfc6750.html#section-2.1) defines the `Authorization: Bearer <token>` request form and the possession risk of Bearer tokens. Defjs expresses that form in an HTTP interceptor; token issuance, validation, scopes, TLS deployment, and resource-server errors remain application or server responsibilities.
- [Go OAuth2 `Transport`](https://github.com/golang/oauth2/blob/4d954e69a88d9e1ccb8439f8d5b6cbef230c4ef9/transport.go#L14-L55) is the existing official source reference for obtaining a token during each round trip and authorizing a cloned request. This example adapts that dispatch-time rule to Defjs; Go's token cache, refresh behavior, and transport stack are not reproduced.
