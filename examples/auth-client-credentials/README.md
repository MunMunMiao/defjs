# OAuth 2.0 Client Credentials for Invoice Exports

## Problem

A scheduled invoice exporter needs an access token without an end user. The client secret must stay in a confidential server workload, and the export should request only its fixed read scope.

The example places HTTP Basic client authentication on one issuer client, serializes the `client_credentials` grant with Defjs, and validates the token document before returning it to business code.

## Scenario

The `invoice-exporter` machine posts to `https://issuer.invalid/oauth2/token`. A local issuer parses the URL-encoded form, accepts the expected Basic credential and `invoices:read` scope, then returns a 900-second Bearer token. The runner prints grant and token metadata but never the client secret or access token.

## Approach

Send the client-credentials grant as an URL-encoded form through an HTTPS client with scoped Basic authentication, then validate the token document and expose only non-secret metadata.

## Source map

- [`src/index.ts`](./src/index.ts): OAuth request contract, token operation, local issuer fixture, confidential-client configuration, and redacted output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-client-credentials start
```

The command performs no external traffic.

## Expected result

```text
{"expiresIn":900,"grantType":"client_credentials","scope":"invoices:read","tokenType":"Bearer"}
```

The form values come from the parsed local request. `expiresIn` and `tokenType` come from the Struct-validated response; token bytes are intentionally omitted.

## Key points

- Client credentials belong in a confidential workload, never browser code.
- Basic client authentication and the URL-encoded OAuth grant are separate wire responsibilities.
- The scope is fixed by the business operation rather than selected by each caller.

## Production notes

Replace `fixtureFetch` with the authorization server transport and load the client ID and secret atomically from a secret manager. Pin the expected issuer, retain TLS verification, redact credentials and tokens, cache tokens by identity and scope, and apply expiry skew before reuse.

## Inspiration

- [RFC 6749, Client Credentials Grant](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4) restricts this grant to confidential clients and defines the `grant_type=client_credentials` token request. Defjs expresses the form as `struct.urlencoded` plus an HTTP client interceptor; client registration, token issuance, and resource-server authorization remain external.
- [RFC 6749, Access Token Scope](https://www.rfc-editor.org/rfc/rfc6749.html#section-3.3) defines the space-delimited `scope` request parameter and allows the server to narrow it. This example adopts an application-side exact `invoices:read` scope; dynamic downscoping, consent, and multi-resource scope design are excluded.
- [Spring Security client-credentials token request test](https://github.com/spring-projects/spring-security/blob/25f2e1c2a3add3ae834165aed0fe4d166f6f9298/oauth2/oauth2-client/src/test/java/org/springframework/security/oauth2/client/endpoint/WebClientReactiveClientCredentialsTokenResponseClientTests.java#L92-L105) is the existing official implementation reference for the grant's request construction. Defjs uses a typed command and Basic interceptor for the same wire responsibilities; Spring's registration model, reactive stack, and token manager are not reproduced.
