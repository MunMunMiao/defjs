---
title: React
description: Share a Defjs client through React context, configure it for your API, and clean up requests and realtime resources from effects.
---

# `@defjs/react`

`@defjs/react` is a thin context adapter for `@defjs/core`. It exports:

- `ClientProvider`, which creates and provides a core client;
- `useClient()`, which returns the nearest provided client;
- adapter `withEndpoint(...)` and interceptor-factory `withInterceptors(...)` helpers.

It does not add caching, Suspense integration, query retries, or server data serialization. Install it alongside `@defjs/core` and React, then let your application keep ownership of those higher-level concerns.

## Provide a Client

```tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserProfile } from './UserProfile'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile id={7} />
    </ClientProvider>
  )
}
```

A committed provider mount retains one client. Ordinary rerenders do not reapply a changed `options` array or replace the client.

The implementation uses a lazy `useState` initializer. Do not rely on that initializer running exactly once in development: React Strict Mode can evaluate render-time initialization more than once before committing. The lifecycle guarantee that matters is that one committed provider mount exposes one retained client.

Remount the provider when the application deliberately needs a new client:

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## Read the Nearest Client

Call `useClient()` inside a React component or custom Hook:

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

It throws outside a provider. Nested providers follow normal React Context behavior; descendants receive the nearest provider's client.

`ClientProvider` accepts any core `ClientOption`:

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Interceptor Factories

The adapter's `withInterceptors(...)` accepts factories. It evaluates them when the provider creates its client and appends their results in option order.

```tsx
import type { ReactNode } from 'react'
import { createHttpInterceptor } from '@defjs/core'
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { readAccessToken } from './auth'

function createAuthInterceptor() {
  return createHttpInterceptor((request, next) => {
    const token = readAccessToken()
    if (!token) {
      return next(request)
    }

    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return next({ ...request, headers })
  })
}

export function ApiBoundary({ children }: { children: ReactNode }) {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(createAuthInterceptor)]}>{children}</ClientProvider>
  )
}
```

Core `withInterceptors(...)` accepts interceptor values instead. Keep server credential factories inside the request boundary that owns those credentials.

## Own HTTP Effects

Create cancellation inside the effect and ignore completion after cleanup:

```tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const abort = new AbortController()

    void client
      .execute(getUser({ path: { id } }), { signal: abort.signal })
      .then(([error, user]) => {
        if (abort.signal.aborted) {
          return
        }

        if (error) {
          setErrorMessage('Unable to load user.')
          return
        }

        setErrorMessage('')
        setName(user.name)
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setErrorMessage('Unable to load user.')
        }
      })

    return () => abort.abort()
  }, [client, id])

  return errorMessage ? <p>{errorMessage}</p> : <p>{name}</p>
}
```

Defjs returns expected request failures in tuples. Convert an error to a thrown value only at an integration boundary that expects exceptions, such as a query library's `queryFn`.

## Query and GraphQL Boundaries

When TanStack Query owns caching, retry, stale-result suppression, and component cleanup, put the Defjs command inside its `queryFn`, forward the supplied signal, and convert the tuple error to a throw at that boundary:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const query = useQuery({
    queryKey: ['user', id],
    queryFn: async ({ signal }) => {
      const [error, user] = await client.execute(getUser({ path: { id } }), { signal })
      if (error) {
        throw error
      }
      return user
    },
  })

  return <p>{query.data?.name ?? (query.error ? 'Unable to load user.' : 'Loading...')}</p>
}
```

Do not wrap the same request in a second application effect; let one lifecycle owner control cancellation and stale results. `@defjs/react` also does not provide GraphQL hooks, a normalized GraphQL cache, generated operation types, or the GraphQL WebSocket protocol. A GraphQL-first application should compose a dedicated GraphQL client and, for subscriptions, follow the [GraphQL WebSocket boundary](../core/web-socket.md#graphql-over-websocket).

## Client Component Boundary

The package does not establish a React Server Component client boundary for your application. Put `ClientProvider` behind an application-owned module that starts with `'use client'`.

Create an application-owned Client Component:

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

Server code that carries request headers, cookies, tenant state, or user credentials should create a core client inside each server request boundary. Do not capture those values in a module-level provider option or cross-request singleton. The adapter does not provide concurrent SSR isolation.

React Server Components, Next.js, hydration, Strict Mode, and concurrent SSR all add framework-specific lifecycle boundaries. Test the exact configuration used by your application, especially request-scoped credentials and provider remounting.

## Own Realtime Effects

A provider unmount does not close resources started by descendants. An effect that opens a WebSocket must abort startup, close a late-arriving session, consume the incoming queue, unsubscribe observers, and close the active session.

```tsx
import { useEffect } from 'react'
import { useClient } from '@defjs/react'
import { openNotificationsSocket } from './api'
import { handleNotification } from './notifications'
import { recordRealtimeFailure } from './telemetry'

export function LiveNotifications() {
  const client = useClient()

  useEffect(() => {
    const abort = new AbortController()
    let disposed = false
    let closeActiveSession: ((reason: string) => void) | undefined

    void (async () => {
      const [error, session] = await client.execute(openNotificationsSocket(), {
        signal: abort.signal,
      })

      if (error) {
        if (!abort.signal.aborted) {
          recordRealtimeFailure({ operation: 'notifications-startup' })
        }
        return
      }

      const unsubscribeError = session.onRuntimeError(() => {
        recordRealtimeFailure({ operation: 'notifications' })
      })
      let closeRequested = false

      const closeSession = (reason: string) => {
        if (closeRequested) {
          return
        }
        closeRequested = true
        unsubscribeError()
        session.close(1000, reason)
      }
      closeActiveSession = closeSession

      if (disposed) {
        closeSession('effect-disposed')
        await session.closed
        return
      }

      try {
        for await (const message of session.receive) {
          if (disposed) {
            break
          }
          handleNotification(message)
        }
      } finally {
        closeSession('consumer-finished')
        await session.closed
      }
    })().catch(() => {
      if (!abort.signal.aborted) {
        recordRealtimeFailure({ operation: 'notifications-consumer' })
      }
    })

    return () => {
      disposed = true
      abort.abort()
      closeActiveSession?.('effect-disposed')
    }
  }, [client])

  return null
}
```

This fragment assumes `recordRealtimeFailure` is an application telemetry function. It intentionally consumes `session.receive`; leaving the finite incoming queue unread eventually makes overflow fatal to the session. Apply the same startup and cleanup discipline to SSE handles.

Provider unmount/remount changes client scope. It does not call `dispose`, abort requests, or close handles and sessions because core `Client` has no such lifecycle API.

## API

```typescript
import type { Client, ClientOption, Interceptor } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  children?: ReactNode
  options?: ClientOption[]
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
declare function withEndpoint(endpoint: string): ClientOption
declare function withInterceptors(...factories: (() => Interceptor)[]): ClientOption
```

## Next

- [Client](../core/client.md) covers core option composition and scope.
- [Errors](../core/errors.md) covers tuple-to-exception integration boundaries.
- [SSE](../core/sse.md) and [WebSocket](../core/web-socket.md) cover realtime ownership.
