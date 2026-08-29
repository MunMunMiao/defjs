---
title: '@defjs/react'
description: ClientProvider, useClient, and provider props.
---

# React {#page}

Provide an existing `@defjs/core` client to a React tree. This package does not create, cache, or dispose the client.

See the [React guide](/plugins/react).

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Context provider. Pass a client from `createClient`.

```tsx
import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import type { ReactNode } from 'react'

const client = createClient(withEndpoint('https://api.example.com'))

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

## useClient() {#useClient}

```ts
function useClient(): Client
```

Reads the nearest `ClientProvider`.

- **Returns** the provided client.
- **Throws** if called outside a `ClientProvider`.

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
