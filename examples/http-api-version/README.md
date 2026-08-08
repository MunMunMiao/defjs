# HTTP API Version Header for GitHub Repository Reads

## Problem

A release service reads GitHub repository metadata before publishing an artifact. Relying on GitHub's default REST API version ties behavior to a server-side default that can change independently of the deployed service.

The configured Defjs client should own `X-GitHub-Api-Version: 2022-11-28` for every request it dispatches.

## Scenario

The runner loads `acme-payments/ledger` through a client configured with a version interceptor. The injected local Fetch fixture reads the final native header and returns a small repository response. It never contacts GitHub and needs no token.

## Approach

Install one client-wide interceptor that adds the reviewed API version to the final request, then execute the reusable repository definition against a local Fetch fixture.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported operation, version interceptor, local fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-api-version start
```

## Expected result

```text
{"version":"2022-11-28","repository":{"id":841,"name":"ledger"}}
```

The header value is observed at the transport boundary, after the interceptor has applied the client's version policy.

## Key points

- API versioning is client dispatch policy, not a value repeated by each caller.
- `Headers.set` establishes one version value at this interceptor stage.
- Version negotiation remains independent from repository response validation.

## Production notes

Use `https://api.github.com`, add a narrowly scoped credential policy, and test a newer supported version before changing the pinned date.

## Inspiration

- [GitHub REST API versions](https://github.com/github/docs/blob/b17436de8f10c3e7f6a185d6813bf94bc82d22f8/content/rest/about-the-rest-api/api-versions.md#L30-L61) documents date-based versions and the `X-GitHub-Api-Version` header.
