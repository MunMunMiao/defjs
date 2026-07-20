---
title: React
description: Thin React adapter for @defjs/core with ClientProvider, useClient, and cookbook notes for mainstream app-layer integrations.
---

# @defjs/react

`@defjs/react` is a thin adapter over `@defjs/core`. It creates a typed client at a React boundary with `ClientProvider`, exposes that client through React Context, and lets descendants read it with `useClient()`.

It does not implement query caching, retries, Suspense, or application state management. Use those patterns at the application layer by calling `client.execute(...)` from your own hooks, loaders, or third-party libraries.

## Repository workspace setup

This page currently documents source/workspace usage from this repository. `@defjs/react` lives at `packages/react`, and its peer dependency expects the matching `@defjs/core` workspace version from `packages/core`.

The import specifiers shown below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. Public npm does not currently provide `@defjs/react`, and the latest standalone `@defjs/core` release available there does not match the API shown here. If you later publish compatible `@defjs/react` and `@defjs/core` versions, install those published versions together in that environment instead of mixing this package with an older standalone `@defjs/core` release.

Current workspace/package baseline: this repository uses `Node >=26`, `pnpm@11.6.0`, and `engine-strict=true`, and `packages/react/package.json` currently declares `engines.node >=26`. That means this source checkout and any package built from the current manifests have a Node >=26 floor. If you install a future published package, follow the engine field and release notes that ship with that published version.

React itself remains a peer dependency. `@defjs/react` supports React 18 and newer.

## What the adapter owns

Use `@defjs/react` when you want React-owned client injection:

- `ClientProvider` creates one `@defjs/core` client per provider mount.
- `useClient()` reads the nearest provided client.
- `withEndpoint` and `withInterceptors` are React-specific client option glue for provider setup.

If you need to create a client outside React component trees, use `createClient(...)` from `@defjs/core` directly. That is the right place for request-scoped server helpers, test fixtures, and non-React integration code.

## Quick Start

### 1. Define requests in a shared module

```tsx
// api.ts
import { defineRequest, struct } from '@defjs/core'

export const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
  ] as const,
})
```

### 2. Provide one client at the React boundary

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserProfile } from './UserProfile'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile id={1} />
    </ClientProvider>
  )
}
```

`ClientProvider` creates the client once per mount and keeps it stable for descendants.

### 3. Read the client in a component

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('loading...')

  useEffect(() => {
    const abort = new AbortController()

    void client
      .execute(getUser({ path: { id } }), { signal: abort.signal })
      .then(([error, user]) => {
        if (abort.signal.aborted) {
          return
        }

        if (error) {
          setName(error.message)
          return
        }

        setName(user.name)
      })
      .catch((error) => {
        if (abort.signal.aborted) {
          return
        }

        setName(error instanceof Error ? error.message : String(error))
      })

    return () => {
      abort.abort()
    }
  }, [client, id])

  return <div>{name}</div>
}
```

If `useClient()` is called outside `ClientProvider`, it throws immediately so the missing provider is visible during development.

## Option helpers

`withEndpoint` and `withInterceptors` in `@defjs/react` are provider-oriented helpers. withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

```tsx
import type { ReactNode } from 'react'
import { createHttpInterceptor } from '@defjs/core'
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'

const authInterceptor = createHttpInterceptor(async (request, next) => {
  const headers = request.headers ?? new Headers()
  request.headers = headers
  headers.set('authorization', 'Bearer token')
  return next(request)
})

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(() => authInterceptor)]}>{children}</ClientProvider>
  )
}
```

If you are building a client outside React, use `@defjs/core` directly:

```ts
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (request, next) => {
      const headers = request.headers ?? new Headers()
      request.headers = headers
      headers.set('authorization', 'Bearer token')
      return next(request)
    }),
  ),
)
```

## Cookbook

### Next.js App Router: keep server clients request-scoped

`@defjs/react` only owns client injection inside React components. In Next.js App Router, create server-side defjs clients with `@defjs/core` inside the request boundary, and keep browser-side client sharing in a client component that renders `ClientProvider`.

```ts
// app/lib/createServerClient.ts
import { cookies, headers } from 'next/headers'
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

export async function createServerClient() {
  const requestHeaders = await headers()
  const requestCookies = await cookies()
  const reviewedCookieNames = ['session', 'csrf-token'] as const
  const serializeForwardedCookie = (name: (typeof reviewedCookieNames)[number], value: string) => `${name}=${encodeURIComponent(value)}`

  return createClient(
    withEndpoint(process.env.API_ENDPOINT!),
    withInterceptors(
      createHttpInterceptor(async (request, next) => {
        const requestId = requestHeaders.get('x-request-id')
        const reviewedCookieHeader = reviewedCookieNames
          .flatMap((name) => {
            const cookie = requestCookies.get(name)
            return cookie ? [serializeForwardedCookie(name, cookie.value)] : []
          })
          .join('; ')

        if (requestId || reviewedCookieHeader) {
          const forwardedHeaders = request.headers ?? new Headers()
          request.headers = forwardedHeaders

          if (requestId) {
            forwardedHeaders.set('x-request-id', requestId)
          }

          if (reviewedCookieHeader) {
            forwardedHeaders.set('cookie', reviewedCookieHeader)
          }
        }

        return next(request)
      }),
    ),
  )
}
```

```tsx
// app/api-provider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

Forward only the headers and cookies your application has reviewed. Build forwarded cookies from an explicit allowlist your app owns instead of passing through the entire incoming cookie jar. `@defjs/react` does not automatically read `headers()` or `cookies()` for you.

### TanStack Query: let Query own cache and retries

Treat defjs as the typed transport layer. TanStack Query owns cache entries, retries, background refetch, and loading state.

```tsx
import { useQuery } from '@tanstack/react-query'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function useUserQuery(id: number) {
  const client = useClient()

  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const [error, user] = await client.execute(getUser({ path: { id } }))
      if (error) {
        throw error
      }
      return user
    },
  })
}
```

That explicit `throw error` is the integration boundary. Defjs itself still returns an error-first tuple.

### Prefetch, dehydrate, and hydrate: keep cached data in TanStack Query

For prefetch flows, create and own the `QueryClient` in your application code, then call a fetch helper from the query prefetch function and let that helper use `client.execute(...)` before handing the result to TanStack Query:

```ts
import { type Client } from '@defjs/core'
import { type QueryClient } from '@tanstack/react-query'
import { getUser } from './api'

type GetUserData = {
  id: number
  name: string
}

type FetchUser = (id: number) => Promise<GetUserData>

export async function prefetchUser(queryClient: QueryClient, fetchUser: FetchUser, id: number) {
  await queryClient.prefetchQuery({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
  })
}

export async function fetchUserWithClient(client: Client, id: number): Promise<GetUserData> {
  const [error, user] = await client.execute(getUser({ path: { id } }))
  if (error) {
    throw error
  }
  if (!user) {
    throw new Error('Expected getUser to return a user payload')
  }
  return user
}
```

Let TanStack Query own `dehydrate(...)` and `HydrationBoundary`. Keep serialized query data in TanStack Query's hydration payload rather than trying to store cached data inside the defjs client.

### Error Boundaries: tuple failures are not thrown automatically

`client.execute(...)` does not throw for normal request failures. It returns `[error, undefined, response?]`. React Error Boundaries only see thrown errors, so convert tuple failures into thrown errors at the integration layer when you want boundary behavior.

```tsx
export function UserScreen({ id }: { id: number }) {
  const query = useUserQuery(id)

  if (query.error) {
    throw query.error
  }

  if (!query.isSuccess) {
    return <div>Loading...</div>
  }

  return <div>{query.data.name}</div>
}
```

### ClientProvider lifecycle: remount when you need a new client

`ClientProvider` reads `options` when it mounts and keeps the created client stable for that subtree. If endpoint, auth context, or interceptor wiring must produce a different client instance, remount the provider at the boundary that owns that lifecycle.

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApp tenantId={tenantId} />
</ClientProvider>
```

Create the client at the same lifecycle boundary where you want its interceptors and configuration to live. In browser-only apps that is often the top-level provider. In request-scoped rendering, create request-specific clients with `@defjs/core` so sensitive headers and cookies do not leak across users.

## API Reference

### `<ClientProvider options?: ClientOption[]>`

Creates a client and provides it to child components. Options are applied when the provider mounts.

### `useClient(): Client`

Returns the client from the nearest `ClientProvider`. Throws if no provider is found.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client created by `ClientProvider`.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptor factories for the client created by `ClientProvider`. withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

## Notes

- `ClientProvider` is marked with `"use client"`, so render it from a client component boundary in React Server Component applications.
- The adapter does not change the request, command, interceptor, or error model from `@defjs/core`.
- For HTTP, see [Commands →](/core/commands); for transport configuration, see [Client →](/core/client).

## What's Next

- [Client →](/core/client) — Client creation and execution model
- [Commands →](/core/commands) — HTTP, SSE, and WebSocket command definitions
- [Interceptors →](/core/interceptors) — Core interceptor registration and transport chains
