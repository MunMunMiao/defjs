---
title: React
description: Intégration React — ClientProvider, useClient et option helpers pour partager des clients @defjs/core typés dans les applications React.
---

# @defjs/react

`@defjs/react` intègre `@defjs/core` à React. Il crée un `Client` une seule fois, l’expose via React Context et permet aux composants enfants de le lire avec `useClient()`.

Utilise-le quand une application React doit partager un client typé pour les commandes HTTP, SSE ou WebSocket.

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

`react` est une peer dependency. `@defjs/react` prend en charge React 18 et les versions ultérieures.

## Fournir Client

Enveloppe la partie de l’arbre de composants qui a besoin du client avec `ClientProvider`.

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

`ClientProvider` crée un client `@defjs/core` à partir des options fournies et le stocke dans un React Context privé.

## Utiliser Client

Appelle `useClient()` dans un composant enfant pour récupérer le client fourni le plus proche.

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

Si `useClient()` est appelé en dehors de `ClientProvider`, il lance une erreur runtime pour rendre le provider manquant visible immédiatement.

## Option Helpers

`withEndpoint` et `withInterceptors` sont des helpers du package React qui produisent des client options pour `@defjs/core`.

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

`withInterceptors` accepte des fonctions factory. Chaque factory retourne un interceptor, et les interceptors obtenus sont enregistrés sur le client créé.

## Client Components

Le wrapper React est marqué avec `"use client"`. Dans les applications React Server Component, rends `ClientProvider` depuis une frontière de client component.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## Référence API

### `<ClientProvider options?: ClientOption[]>`

Crée un client et le fournit aux composants enfants. Les options sont évaluées lorsque le provider crée le client.

### `useClient(): Client`

Retourne le client du `ClientProvider` le plus proche. Lance une erreur si aucun provider n’est trouvé.

### `withEndpoint(endpoint: string): ClientOption`

Définit l’URL base endpoint du client.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Enregistre des interceptors via des fonctions factory.

## Notes

- React 18 ou une version ultérieure est requis.
- `ClientProvider` appartient au code de client component.
- `useClient()` doit s’exécuter sous un `ClientProvider`.
- `@defjs/react` ne modifie pas le modèle request, command, interceptor ou error de `@defjs/core`.

## Prochaines étapes

- [Client →](/core/client) — Création et configuration du Client
- [Intercepteurs →](/core/interceptors) — Chaînes d’interceptor en modèle oignon
- [Commandes →](/core/commands) — Définitions de commands HTTP, SSE et WebSocket
