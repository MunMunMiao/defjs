# Kubernetes resourceVersion for Checkout Configuration

## Problem

A controller reads `team-blue/checkout-flags` at `resourceVersion: "847"`. Another writer may update the ConfigMap before replacement, so sending stale state without the token could erase a newer value.

The controller must send the opaque token back in `metadata.resourceVersion`, accept the server's next token on success, and surface typed `409 Conflict` without replaying stale state.

## Scenario

The fixture begins with checkout mode `standard` at version `847`. A replacement carrying `847` stores `maintenance` and returns version `848`. A second replacement still carrying `847` receives `409` and cannot revert the stored mode.

## Approach

Round-trip the opaque `resourceVersion` in the replacement body, advance the fixture only for a matching version, and classify the declared runtime `409` as a stale-write conflict.

## Source map

- [`src/index.ts`](./src/index.ts): ConfigMap request, conditional replacement operation, stateful local fixture, and runner.

## Run

From the repository root:

```sh
pnpm --silent --filter @defjs/example-consistency-resource-version start
```

## Expected result

```text
{"replaced":"848","conflict":"conflict","checkoutMode":"maintenance"}
```

The first replacement receives version `848`; the stale result is `conflict`, and the accepted maintenance mode remains stored.

## Key points

- `resourceVersion` is an opaque concurrency token; clients do not increment or order it.
- Kubernetes carries this token in object metadata rather than an HTTP precondition header.
- `CheckoutMode` is inferred from the same `struct.enum` that rejects undeclared modes at the request boundary.

## Production notes

Preserve the complete object when using replacement, or deliberately choose patch or Server-Side Apply. On conflict, refetch and recompute desired state under a bounded reconciliation policy. Use least-privileged cluster credentials.

## Inspiration

- [Kubernetes API conventions, concurrency control and consistency](https://github.com/kubernetes/community/blob/10d0b0511c55c3fc8766cfb519e0c6f7e9e4b34c/contributors/devel/sig-architecture/api-conventions.md#L1146-L1182) is the retained specification for opaque `resourceVersion` and conflict handling.
- [Kubernetes API concepts, resource versions](https://kubernetes.io/docs/reference/using-api/api-concepts/#resource-versions) documents that clients must treat the value as opaque.
