---
title: '@defjs/react'
description: Provider と `useClient()` です。
---

# React {#page}

既存の `@defjs/core` クライアントを React ツリーに繋ぎます。このパッケージはクライアントを**作らず**、キャッシュも付けず、トランスポート資源も破棄しません。

[React ガイド](../plugins/react.md) を見てください。

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Context provider です。`createClient` のクライアントを渡します。

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

一番近い `ClientProvider` を読みます。

- **戻り値** 渡されたクライアントです。
- **例外** `ClientProvider` の外で呼んだときです。

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
