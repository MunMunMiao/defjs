# GitHub Actions OIDC Token Request for Cloud Deployment

## Problem

A GitHub Actions release job requests an OIDC ID token before deploying an artifact. The runner supplies a request URL with runner-owned query state and a Bearer credential. The deployment audience must be appended without losing that state, and the credential must stay scoped to the reviewed HTTPS endpoint.

The example builds one Defjs client from deterministic runner values and keeps the returned token out of output.

## Scenario

The runner URL is `https://runner.invalid/oidc?request_id=release-1042`, its credential is `fixture-runner-token`, and the deployment audience is `https://deploy.example.invalid`. The client preserves `request_id`, appends one percent-encoded `audience`, and adds the Bearer header only for the trusted `/oidc` route.

A local runner service parses the native `Request`, accepts the credential, and returns `{"value":"fixture.oidc.token"}`. The business operation receives that opaque value, while the runner prints only the audience and request ID. No GitHub or external traffic is used.

## Approach

Validate the reviewed runner URL, origin, and credential before creating the client. An origin-scoped interceptor preserves the runner query, adds the deployment audience, and validates the opaque token response.

## Source map

- [`src/index.ts`](./src/index.ts): OIDC request contract, deployment operation, scoped runner client, local service, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-actions-oidc start
```

## Expected result

```text
{"audience":"https://deploy.example.invalid","requestId":"release-1042"}
```

Both fields come from the URL parsed by the local runner service. Successful completion also means Defjs decoded a string `value`, but the token itself is deliberately omitted.

## Key points

- Preserve runner-owned query parameters with `URLSearchParams` before appending the deployment audience.
- Reject an existing audience instead of silently creating conflicting trust input.
- Scope the runner Bearer credential to the expected HTTPS origin and route.
- Receiving an ID token is not deployment authorization; the cloud provider still verifies its claims.

## Production notes

Grant the workflow only `permissions: id-token: write` plus the minimum repository permissions it needs. Prefer `@actions/core.getIDToken(audience)` so GitHub owns this runner protocol. A direct integration must validate the untouched runner URL against the expected GitHub.com or GHES endpoint, never print either credential, and immediately exchange the ID token with a cloud trust policy that pins issuer, audience, repository, ref, and environment claims.

## Inspiration

- [Actions Toolkit OIDC utility](https://github.com/actions/toolkit/blob/e7728b1bcda3082eca6b716f0c6e20c743b7972d/packages/core/src/oidc-utils.ts#L11-L79) is the retained official implementation reference for reading runner variables, appending `audience`, sending the Bearer request, and extracting `value`. Defjs expresses the exchange as a typed command with an explicit endpoint policy.
- [GitHub Docs, OpenID Connect in cloud providers](https://docs.github.com/en/actions/concepts/security/openid-connect) describes short-lived job identity, `id-token: write`, audiences, and provider trust conditions. This example adopts a per-deployment audience and redacted token handling.
- [OpenID Connect Core, ID Token](https://openid.net/specs/openid-connect-core-1_0.html#IDToken) defines the signed claims consumed by the relying party. The runner treats `value` as opaque; signature, issuer, audience, expiry, and subject validation remain cloud-provider responsibilities.
