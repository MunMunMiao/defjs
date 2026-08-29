---
title: '@defjs/react'
description: Provider y `useClient()`.
---

# React {#page}

Conecta un cliente `@defjs/core` existente a un árbol React. El paquete **no** crea un cliente, no añade caché ni dispone recursos de transporte.

Mira la [guía de React](../plugins/react.md).

## ClientProvider {#ClientProvider}

```ts
function ClientProvider(props: ClientProviderProps): ReactElement
```

Provider de contexto. Pasa un cliente de `createClient`.

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

Lee el `ClientProvider` más cercano.

- **Devuelve** el cliente proporcionado.
- **Lanza** fuera de un `ClientProvider`.

## ClientProviderProps {#ClientProviderProps}

```ts
interface ClientProviderProps {
  client: Client
  children?: ReactNode
}
```
