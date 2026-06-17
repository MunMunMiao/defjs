---
title: React
description: React integration — ClientProvider, useClient, and option helpers for sharing typed @defjs/core clients in React applications.
---

# @defjs/react

`@defjs/react` integrates `@defjs/core` with React. It creates a `Client` once, exposes it through React Context, and lets child components read it with `useClient()`.

Use it when a React application needs one shared typed client for HTTP, SSE, or WebSocket commands.

## Installation

::: code-group

```bash [npm]
npm install @defjs/react @defjs/core react
```

```bash [pnpm]
pnpm add @defjs/react @defjs/core react
```

```bash [bun]
bun add @defjs/react @defjs/core react
```

:::

`react` is a peer dependency. `@defjs/react` supports React 18 and newer.

## Provide Client

Wrap the part of the component tree that needs the client with `ClientProvider`.

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <Router />
    </ClientProvider>
  )
}
```

`ClientProvider` creates a `@defjs/core` client from the provided options and stores it in a private React Context.

## Use Client

Call `useClient()` inside a child component to retrieve the nearest provided client.

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

export function UserProfile() {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      if (!error) {
        setName(user.name)
      }
    })
  }, [client])

  return <div>{name}</div>
}
```

If `useClient()` is called outside `ClientProvider`, it throws a runtime error so the missing provider is visible immediately.

## Option Helpers

`withEndpoint` and `withInterceptors` are React package helpers that produce `@defjs/core` client options.

```tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((request, next) => {
  request.headers.set('Authorization', 'Bearer token')
  return next(request)
})

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(() => authInterceptor)]}>
      <Router />
    </ClientProvider>
  )
}
```

`withInterceptors` accepts factory functions. Each factory returns an interceptor, and the resulting interceptors are registered on the created client.

## Client Components

The React wrapper is marked with `"use client"`. In React Server Component applications, render `ClientProvider` from a client component boundary.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API Reference

### `<ClientProvider options?: ClientOption[]>`

Creates a client and provides it to child components. Options are evaluated when the provider creates the client.

### `useClient(): Client`

Returns the client from the nearest `ClientProvider`. Throws if no provider is found.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptors through factory functions.

## Notes

- React 18 or newer is required.
- `ClientProvider` belongs in client component code.
- `useClient()` must run below a `ClientProvider`.
- `@defjs/react` does not change the request, command, interceptor, or error model from `@defjs/core`.

## What's Next

- [Core Client →](/core/client) — Client creation and configuration
- [Interceptors →](/core/interceptors) — Onion-model interceptor chains
- [Commands →](/core/commands) — HTTP, SSE, and WebSocket command definitions
