# @defjs/react

React wrapper for [@defjs/core](../core) — provides dependency injection helpers for using defjs clients in React applications.

Supports React 18+.

## Installation

```bash
npm install @defjs/react @defjs/core
# or
pnpm add @defjs/react @defjs/core
# or
bun add @defjs/react @defjs/core
```

## Quick Start

### 1. Provide a client

```tsx
// App.tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'

function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(authInterceptor)]}>
      <Router />
    </ClientProvider>
  )
}
```

`ClientProvider` creates a `@defjs/core` client and exposes it through a private React Context. It is marked with `"use client"`, so it is safe to use in React Server Component apps.

### 2. Use the client

```tsx
import { useClient } from '@defjs/react'
import { getUser } from './api'

function UserProfile() {
  const client = useClient()

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      // ...
    })
  }, [client])

  return <div>{/* ... */}</div>
}
```

## API

### `<ClientProvider options?: ClientOption[]>`

Creates a client and provides it to child components. Nested `ClientProvider`s are supported: components read the nearest provider, so an inner provider creates a separate client for its subtree while siblings continue using the outer client.

### `useClient(): Client`

Returns the client provided by the nearest `ClientProvider`. Throws if called outside a provider.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client. If omitted, the client defaults to an empty endpoint.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptors for the client.

```tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'

function App() {
  return (
    <ClientProvider
      options={[
        withEndpoint('https://api.example.com'),
        withInterceptors(() => ({
          request({ request }) {
            request.headers.set('Authorization', 'Bearer token')
          },
        })),
      ]}
    >
      <Router />
    </ClientProvider>
  )
}
```

## Version Compatibility

| @defjs/react | @defjs/core |
| ------------ | ----------- |
| 0.x          | workspace:^ |

## License

[MIT](../../LICENSE)
