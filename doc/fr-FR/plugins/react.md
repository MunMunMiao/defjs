---
title: React
description: Partagez un client Defjs avec React Context, configurez-le pour votre API et nettoyez les requêtes et ressources temps réel depuis les effets.
---

# `@defjs/react`

Ce paquet est un adaptateur Context minimal pour `@defjs/core`. `ClientProvider` fournit un client créé par l’application et `useClient()` renvoie l’instance la plus proche. Il n’ajoute ni fabrique de client, ni cache, ni retry, ni cycle de vie des ressources.

## Fournir un client

Créez et configurez le client avec `@defjs/core`, puis passez explicitement cette instance :

```tsx
import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import { UserProfile } from './UserProfile'

const client = createClient(withEndpoint('https://api.example.com'))

export function App() {
  return (
    <ClientProvider client={client}>
      <UserProfile id={7} />
    </ClientProvider>
  )
}
```

`ClientProvider` expose exactement cette instance. L’appelant décide de sa création ou de son remplacement et reste propriétaire des requêtes et ressources temps réel.

## Lire le client le plus proche

Appelez `useClient()` dans un composant React ou un Hook personnalisé. Un appel hors provider lève une erreur ; les providers imbriqués suivent la règle normale du Context le plus proche.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

Toutes les options de configuration proviennent de `@defjs/core` :

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Fabriques d'intercepteurs

Créez les valeurs interceptor et composez-les avec le `withInterceptors(...)` du core avant de passer le client à React :

```tsx
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'
import { ClientProvider } from '@defjs/react'

const auth = createHttpInterceptor((request, next) => {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${readAccessToken()}`)
  return next({ ...request, headers })
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(auth))

export function ApiBoundary({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

Si une fabrique capture des identifiants propres à une requête, appelez-la dans la frontière de requête qui crée ce client.

## Gérer le cycle de vie des effets HTTP

Créez l'annulation dans l'effet et ignorez toute fin d'exécution après le nettoyage :

```tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const abort = new AbortController()

    void client
      .execute(getUser({ path: { id } }), { signal: abort.signal })
      .then(([error, user]) => {
        if (abort.signal.aborted) {
          return
        }

        if (error) {
          setErrorMessage('Unable to load user.')
          return
        }

        setErrorMessage('')
        setName(user.name)
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setErrorMessage('Unable to load user.')
        }
      })

    return () => abort.abort()
  }, [client, id])

  return errorMessage ? <p>{errorMessage}</p> : <p>{name}</p>
}
```

Defjs renvoie les échecs de requête attendus dans des tuples. Ne transformez une erreur en exception qu'à une frontière d'intégration qui l'exige, par exemple le `queryFn` d'une bibliothèque de query.

## Frontière Client Component

L’entrée du paquet est une frontière Client Component. Un wrapper appartenant à l’application peut créer un client navigateur et le fournir explicitement :

```tsx
// app/ApiProvider.tsx
'use client'

import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import type { ReactNode } from 'react'

const client = createClient(withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!))

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

Le code serveur transportant headers, cookies, état de tenant ou identifiants doit créer un client distinct dans chaque frontière de requête. L’adaptateur n’isole pas les rendus SSR concurrents et ne libère pas le travail du client.

## Gérer le cycle de vie des effets temps réel

Le démontage d'un provider ne ferme pas les ressources lancées par ses descendants. Un effet qui ouvre une WebSocket doit annuler le démarrage, fermer toute session arrivée trop tard, consommer la file entrante, désinscrire les observateurs et fermer la session active.

```tsx
import { useEffect } from 'react'
import { useClient } from '@defjs/react'
import { openNotificationsSocket } from './api'
import { handleNotification } from './notifications'
import { recordRealtimeFailure } from './telemetry'

export function LiveNotifications() {
  const client = useClient()

  useEffect(() => {
    const abort = new AbortController()
    let disposed = false
    let closeActiveSession: ((reason: string) => void) | undefined

    void (async () => {
      const [error, session] = await client.execute(openNotificationsSocket(), {
        signal: abort.signal,
      })

      if (error) {
        if (!abort.signal.aborted) {
          recordRealtimeFailure({ operation: 'notifications-startup' })
        }
        return
      }

      const unsubscribeError = session.onRuntimeError(() => {
        recordRealtimeFailure({ operation: 'notifications' })
      })
      let closeRequested = false

      const closeSession = (reason: string) => {
        if (closeRequested) {
          return
        }
        closeRequested = true
        unsubscribeError()
        session.close(1000, reason)
      }
      closeActiveSession = closeSession

      if (disposed) {
        closeSession('effect-disposed')
        await session.closed
        return
      }

      try {
        for await (const message of session.receive) {
          if (disposed) {
            break
          }
          handleNotification(message)
        }
      } finally {
        closeSession('consumer-finished')
        await session.closed
      }
    })().catch(() => {
      if (!abort.signal.aborted) {
        recordRealtimeFailure({ operation: 'notifications-consumer' })
      }
    })

    return () => {
      disposed = true
      abort.abort()
      closeActiveSession?.('effect-disposed')
    }
  }, [client])

  return null
}
```

Ce fragment suppose que `recordRealtimeFailure` est une fonction de télémétrie applicative. Il consomme volontairement `session.receive` : si la file entrante bornée reste sans lecteur, son overflow termine fatalement la session. Appliquez la même discipline de démarrage et de nettoyage aux handles SSE.

Le démontage ou le remontage du provider change la portée du client. Il n'appelle pas `dispose`, n'annule aucune requête et ne ferme ni handle ni session, car le `Client` Core ne possède pas cette API de cycle de vie.

## API

```typescript
import type { Client } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  client: Client
  children?: ReactNode
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
```

Fournit le client reçu aux descendants. `children` est facultatif.

Renvoie le client fourni le plus proche et lève une erreur s’il n’existe pas.

## Étapes suivantes

- [Client](/fr-FR/core/client) couvre la composition des options Core et leur portée.
- [Erreurs](/fr-FR/core/errors) couvre les frontières d'intégration qui convertissent un tuple en exception.
- [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) couvrent la responsabilité des ressources temps réel.
