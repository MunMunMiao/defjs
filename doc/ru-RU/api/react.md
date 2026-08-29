---
title: '@defjs/react'
description: Provider и `useClient()`.
---

# React {#page}

Подключи существующий `@defjs/core` client к React-дереву. Пакет **не** создаёт client, не вешает кэш и не dispose’ит транспорт.

См. [гайд React](../plugins/react.md).

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Context provider. Передай client из `createClient`.

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

Читает ближайший `ClientProvider`.

- **Возвращает** отданный client.
- **Бросает** вне `ClientProvider`.

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
