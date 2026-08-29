---
title: '@defjs/react'
description: Provider und `useClient()`.
---

# React {#page}

Verdrahte einen bestehenden `@defjs/core`-Client in einen React-Tree. Das Paket erzeugt **keinen** Client, fügt keinen Cache hinzu und disposet keine Transport-Resources.

Sieh den [React-Guide](../plugins/react.md).

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Context-Provider. Übergib einen Client von `createClient`.

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

Liest den nächsten `ClientProvider`.

- **Gibt zurück** den bereitgestellten Client.
- **Wirft** außerhalb eines `ClientProvider`.

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
