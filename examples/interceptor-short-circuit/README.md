# Cache-Hit Short Circuit for Support Agent Profiles

## Problem

A support console repeatedly opens the on-call agent's profile while a synchronized in-memory snapshot is available. Calling `next` after finding that snapshot still sends an unnecessary origin request and can replace the intended cached result.

The application-owned invariant is that the cached agent returns a Defjs response without invoking downstream transport, while another agent delegates normally. Cache freshness, invalidation, persistence, and authorization partitioning remain production responsibilities.

## Scenario

The cache contains `agent-42`, Mina Park. Its request is served directly by `serveCachedAgent`. A request for `agent-99` misses and reaches a local origin that returns Theo Reed. Both profiles pass the same declared response Struct.

## Approach

Return a typed Defjs response directly for the exact cached agent request; a cache miss calls `next` and reaches the local origin under the same response Struct.

## Source map

- [`src/index.ts`](./src/index.ts): Request contract, exported operation, short-circuit interceptor, local origin, and the hit/miss demonstration.

## Run

From the repository root, with pnpm workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-interceptor-short-circuit start
```

## Expected result

```text
{"cachedProfile":{"id":"agent-42","displayName":"Mina Park","source":"cache"},"originProfile":{"id":"agent-99","displayName":"Theo Reed","source":"origin"}}
```

The two `source` values show the cache hit and delegated miss while both bodies use the same Defjs contract. The runner is local, opens no listener, and exits after both operations settle.

## Production notes

Use a bounded cache key that includes the authenticated principal, tenant, operation, and representation-varying inputs. Define TTL and invalidation policy before sharing authorization-sensitive responses.

## Inspiration

- [Defjs HTTP context test](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/http/http.context.spec.ts#L13-L34) is the existing project-owned executable reference showing that an HTTP interceptor can return `makeResponse` directly instead of invoking `next`. This example applies that public behavior to one precisely keyed profile cache hit; cache freshness, eviction, authorization partitioning, and protocol-level HTTP caching remain application-owned and out of scope.
