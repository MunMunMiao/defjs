# Validated Environment Endpoint for Tenant Billing

## Problem

A billing worker receives its API base URL from deployment configuration. Passing unchecked text directly to a client can permit plaintext HTTP or embedded URL components, while naive string concatenation can lose the tenant and API-version path.

The client factory parses the value as a credential-free HTTPS URL without query or fragment, then gives the complete base endpoint to Defjs.

## Scenario

The worker is configured with `https://billing.fixture.invalid/tenants/acme/v2` and executes the shared `GET /health` definition. Defjs preserves the tenant/version prefix and sends the local fixture request to `https://billing.fixture.invalid/tenants/acme/v2/health`, which returns a validated ready state.

## Approach

Validate the configured environment URL before constructing the client, preserve its tenant/version base path with `withEndpoint`, and execute the reusable health definition through injected Fetch.

## Source map

- [`src/index.ts`](./src/index.ts): Health definition, environment endpoint factory, local Fetch fixture, execution, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-client-environment-endpoint start
```

Execution is local and offline. It reads no machine environment variable, performs one in-memory Fetch call, and opens no listener.

## Expected result

```text
{"requestUrl":"https://billing.fixture.invalid/tenants/acme/v2/health","health":{"service":"billing","state":"ready"}}
```

`requestUrl` shows that Defjs retained `/tenants/acme/v2` when resolving `/health`. `health` is available only after the response passes its Struct.

## Key points

- Parse deployment text before constructing the client and fail startup on invalid configuration.
- `withEndpoint` preserves a meaningful service base path when resolving the request definition.
- URL syntax validation does not authorize a hostname or add credentials.

## Production notes

Pass the real environment value as `unknown`, add a deployment-specific hostname and port allowlist, and inject the authenticated billing Fetch implementation during client creation. Recreate the client only under an explicit configuration-reload owner.

## Inspiration

- [AWS SDK for JavaScript configurable endpoints](https://github.com/aws/aws-sdk-js-v3/blob/c3b27fd34b72822c9b0a05f0ded228e4247206ce/supplemental-docs/CLIENTS.md#L233-L269) is the retained official guidance for supplying a client endpoint from configuration. Defjs expresses that choice with `withEndpoint`; AWS endpoint providers, regions, signing, and middleware are not reproduced.
- [WHATWG URL Standard, URL parsing](https://url.spec.whatwg.org/#url-parsing) defines structured parsing and user-info, query, and fragment components. This example validates those parsed components before client creation; hostname authorization and deployment policy remain application-owned.
