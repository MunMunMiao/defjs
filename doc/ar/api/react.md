---
title: '@defjs/react'
description: الموفر و`useClient()`.
---

# React {#page}

اربط عميل `@defjs/core` موجودًا بشجرة React. الحزمة **لا** تنشئ عميلًا، ولا تضيف تخزينًا، ولا تتخلص من موارد النقل.

انظر [دليل React](../plugins/react.md).

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

موفر السياق. مرّر عميلًا من `createClient`.

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

يقرأ أقرب `ClientProvider`.

- **يعيد** العميل الموفَّر.
- **يرمي** خارج `ClientProvider`.

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
