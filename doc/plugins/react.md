---
title: React
description: Share a Defjs client through React context, configure it for your API, and clean up requests and realtime resources from effects.
---

# `@defjs/react`

This package is a thin Context adapter for `@defjs/core`. `ClientProvider` provides an application-created client, and `useClient()` returns the nearest instance. It adds no client factory, cache, retry policy, or resource lifecycle.

## Provide a Client

Create and configure the client with `@defjs/core`, then pass that instance explicitly:

```tsx
import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import { UserProfile } from './UserProfile'

const client = createClient(withEndpoint('https://api.example.com'))

export function App() {
  return (
    <ClientProvider client={client}>
      <UserProfile id={7} />
    </ClientProvider>
  )
}
```

`ClientProvider` exposes that exact instance. The caller decides when to create or replace it and remains responsible for requests and realtime resources started through it.

## Read the Nearest Client

Call `useClient()` inside a React component or custom Hook. It throws outside a provider, and nested providers follow normal React Context nearest-provider behavior.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

All configuration options come from `@defjs/core`:

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Interceptor Factories

Create interceptor values and compose them with core `withInterceptors(...)` before passing the client to React:

```tsx
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'
import { ClientProvider } from '@defjs/react'

const auth = createHttpInterceptor((request, next) => {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${readAccessToken()}`)
  return next({ ...request, headers })
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(auth))

export function ApiBoundary({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

If an interceptor factory captures request-specific credentials, call it inside the request boundary that creates that client.

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

The package entry is a Client Component boundary. An application-owned wrapper can create a browser client and provide it explicitly:

```tsx
// app/ApiProvider.tsx
'use client'

import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import type { ReactNode } from 'react'

const client = createClient(withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!))

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

Server code carrying headers, cookies, tenant state, or credentials should create a separate client inside each request boundary. The adapter does not isolate concurrent SSR requests or dispose client-owned work.

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
import type { Client } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  client: Client
  children?: ReactNode
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
```

Provides the supplied client to descendants. `children` is optional.

Returns the nearest provided client and throws when none exists.

## Next

- [Client](../core/client.md) covers core option composition and scope.
- [Errors](../core/errors.md) covers tuple-to-exception integration boundaries.
- [SSE](../core/sse.md) and [WebSocket](../core/web-socket.md) cover realtime ownership.
