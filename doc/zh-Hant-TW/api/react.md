---
title: '@defjs/react'
description: 裝 provider、讀 client。
---

# React {#page}

把既有的 `@defjs/core` client 接進 React 樹。這個套件**不會**建立 client、加快取，也不會釋放傳輸資源。

見 [React 指南](../plugins/react.md)。

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Context provider。把 `createClient` 給的 client 傳進去。

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

讀最近的 `ClientProvider`。

- **回傳** 提供的 client。
- **拋出** 在 `ClientProvider` 外面呼叫時。

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
