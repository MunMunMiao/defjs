# Request-Scoped Tenant Routing for Project Reads

## Problem

Meridian Logistics reads EU and US projects through one long-lived Defjs client. Storing a tenant route in mutable client headers can leak the previous operator's route into a later read.

The application-owned invariant is that each project read validates its tenant slug, stores it in that execution's `HttpContext`, and adds `x-tenant-route` only during dispatch. The route selects a gateway partition; authentication and tenant authorization remain separate production responsibilities.

## Scenario

One client reads projects for `meridian-eu` and then `meridian-us`. A local gateway uses the request's `x-tenant-route` header to return `route-optimizer` for EU and `customs-ledger` for US. The `.invalid` endpoint and injected Fetch implementation keep execution deterministic and offline.

## Approach

Store the validated tenant route in per-call `HttpContext`, add it at dispatch through an interceptor, and reuse one client for both tenant reads without retaining route state.

## Source map

- [`src/index.ts`](./src/index.ts): Request contract, exported business operation, context interceptor, local gateway, and two executions.

## Run

From the repository root, with pnpm workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-client-tenant-routing start
```

## Expected result

```text
{"meridian-eu":[{"id":"route-optimizer"}],"meridian-us":[{"id":"customs-ledger"}]}
```

The different project lists show that each execution supplied its own route even though both calls used the same client. The runner performs no external traffic and exits after the two responses settle.

## Production notes

Resolve the route from an authenticated principal's authorized memberships, keep redirects from forwarding it to another origin, and enforce tenant isolation again in the service and datastore. The routing header is metadata, not authorization proof.

## Inspiration

- [stripe-node request construction](https://github.com/stripe/stripe-node/blob/dea3ce7ecdf7fe3ae9d68391b9512075db521ef7/src/RequestSender.ts#L384-L397) is the existing official client source for translating per-request account or context options into routing headers. This example adopts that request-scoped metadata pattern through a Defjs `HttpContext` token and HTTP interceptor; Stripe's header names, connected-account authorization, idempotency behavior, and server-side routing semantics are not reproduced.
