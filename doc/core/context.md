---
title: Context
description: Pass request-scoped metadata through HTTP and SSE interceptor chains with HttpContext.
---

# Context

`HttpContext` is a token-keyed metadata container. It travels with an HTTP or SSE execution and is available on the `HttpRequest` seen by interceptors. It does not serialize itself into the URL, headers, or body.

## Tokens and Defaults

Create a typed token with a default-value factory:

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

`context.get(token)` calls the token factory when the context has no stored value. The default is not inserted into the context, so a stateful factory can produce a new value on each missing read. Prefer deterministic defaults.

## Create and Pass a Context

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` mutates the context and returns the same context for chaining. `get(...)` and `set(...)` throw `TypeError` for values that are not tokens created by `makeHttpContextToken(...)`.

An interceptor reads the same object:

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

Use fixed operation names and reviewed metadata. Do not put secrets, raw headers, bodies, URLs, or query strings into logs by default.

## Reference Semantics

Execution passes `HttpContext` by reference. If an interceptor mutates it, later interceptors and the caller holding that object can observe the change.

Create a fresh context for every request when it contains request, user, tenant, trace, cookie, or authorization data. Reusing one mutable context across concurrent work can leak or overwrite metadata.

HTTP and SSE execute options currently accept `context`. WebSocket execute options do not. An SSE logical handle keeps the request context associated with its connection attempts; the application should still treat that context as owned by the stream's request scope.

## Copy and Merge

`makeHttpContext(existing)` creates a shallow copy of the token map:

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

The maps are separate, but stored object values are not deep-cloned.

`makeHttpContext(entries)` accepts token/value pairs:

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` returns a new context. Values from `secondary` replace values from `primary` for the same token.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

Passing only one context still returns a copy. Passing neither returns an empty context.

## Context API

| Member              | Behavior                                                     |
| ------------------- | ------------------------------------------------------------ |
| `set(token, value)` | Store a value and return the same context.                   |
| `get(token)`        | Return the stored value or call the token's default factory. |
| `has(token)`        | Test whether a value is stored.                              |
| `del(token)`        | Delete a value and return the same context.                  |
| `keys()`            | Iterate stored tokens.                                       |
| `length`            | Number of stored tokens.                                     |

`isHttpContext(...)` and `isHttpContextToken(...)` are available when code needs runtime guards.

Request mapping is a separate concern. See [Commands](/core/commands) for automatic request sections and schema-bound projections, and [Interceptors](/core/interceptors) for chain behavior.
