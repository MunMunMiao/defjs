---
title: '@defjs/react'
description: Install provider、讀 client。
---

# React {#page}

將現有 `@defjs/core` client wire 入 React tree。Package **唔會** create client、加 cache，或者 dispose transport resources。

見 [React 指南](../plugins/react.md)。

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Context provider。將 `createClient` 俾嘅 client 傳入去。

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

讀最近嘅 `ClientProvider`。

- **回傳** 提供嘅 client。
- **拋出** 喺 `ClientProvider` 外面 call 嗰陣。

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
