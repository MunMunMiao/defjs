# @defjs/react

Thin React adapter for `@defjs/core`. It provides `ClientProvider`, `useClient`, and React-specific option wiring so a typed defjs client can be shared through a component tree.

Supports React 18+.

## Repository workspace setup

This README documents source/workspace usage from this repository. `@defjs/react` lives at `packages/react`, and its peer dependency expects the matching workspace version of `@defjs/core` from `packages/core`.

The imports below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. Public npm does not currently provide `@defjs/react`, and the latest standalone `@defjs/core` release available there does not match the API shown here. If you later publish compatible `@defjs/react` and `@defjs/core` versions, install those published versions together in that environment instead of mixing this package with an older standalone `@defjs/core` release.

Current workspace/package baseline: this repository uses `Node >=26`, `pnpm@11.6.0`, and `engine-strict=true`, and `packages/react/package.json` currently declares `engines.node >=26`. That means this source checkout and any package built from the current manifests have a Node >=26 floor. If you install a future published package, follow the engine field and release notes that ship with that published version.

## What this package does

`ClientProvider` creates one `@defjs/core` client for a mounted provider instance and exposes it through React Context. Ordinary rerenders keep that initial client and do not reapply a changed `options` array. `useClient()` reads the nearest provided client. `withEndpoint` and `withInterceptors` are React-specific option glue for provider setup.

This package is a thin adapter over `@defjs/core`. It does not add a query layer, data cache, Suspense integration, or application state management. Compose those patterns in your own React code by calling `client.execute(...)` from hooks, loaders, or third-party libraries.

## Quick Start

Define requests in a shared module with `@defjs/core`:

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

Provide one shared client to the part of the tree that needs it:

```tsx
// app.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserProfile } from './user-profile'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile id={1} />
    </ClientProvider>
  )
}
```

Read the client inside child components and handle the error-first tuple yourself:

```tsx
// user-profile.tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState<string>('loading...')

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

## Cookbook

When browsing this repository, see `doc/plugins/react.md` for recipes covering Next.js App Router request boundaries, application-owned header and cookie forwarding, TanStack Query integration, hydration boundaries, `ClientProvider` lifecycle, and SSE/WebSocket effect cleanup. Long-lived transports must be closed when their UI owner unmounts, including a successful handle that arrives after cleanup has started.

## API

### `<ClientProvider options?: ClientOption[]>`

Creates a client once per provider mount and exposes it to descendant components.

### `useClient(): Client`

Returns the client from the nearest `ClientProvider`. Throws if called outside a provider.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client created by `ClientProvider`.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptor factories evaluated when `ClientProvider` creates the client. withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

## Notes

- The published entry is marked with `'use client'`, so React Server Component consumers treat this adapter as a client boundary.
- If you need a different client instance, remount the provider at the lifecycle boundary that owns the new configuration. Ordinary rerenders retain the initial client.
- `@defjs/react` does not change the request, command, interceptor, or error model from `@defjs/core`.

## License

MIT License.
