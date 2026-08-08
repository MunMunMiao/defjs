---
title: React
description: Partagez un client Defjs avec React Context, configurez-le pour votre API et nettoyez les requêtes et ressources temps réel depuis les effets.
---

# `@defjs/react`

`@defjs/react` est un adaptateur de contexte léger pour `@defjs/core`. Il exporte :

- `ClientProvider`, qui crée et fournit un client Core ;
- `useClient()`, qui renvoie le client fourni le plus proche ;
- les helpers d'adaptateur `withEndpoint(...)` et `withInterceptors(...)`, ce dernier acceptant des fabriques d'intercepteurs.

Il n'ajoute ni cache, ni intégration Suspense, ni relance de query, ni sérialisation des données serveur. Installez-le avec `@defjs/core` et React, puis gardez ces responsabilités applicatives dans votre propre code.

## Fournir un client

```tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserProfile } from './UserProfile'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile id={7} />
    </ClientProvider>
  )
}
```

Une fois le montage du provider validé, celui-ci conserve un seul client. Les rendus suivants ne réappliquent pas un tableau `options` modifié et ne remplacent pas ce client.

L'implémentation utilise l'initialisation paresseuse de `useState`. Ne supposez pas qu'elle ne s'exécute qu'une fois en développement : React Strict Mode peut l'évaluer plusieurs fois avant le commit. La garantie utile est qu'un montage validé du provider expose ensuite le même client.

Forcez un nouveau montage du provider lorsque l'application doit volontairement créer un nouveau client :

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## Lire le client le plus proche

Appelez `useClient()` dans un composant React ou un Hook personnalisé :

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

Le Hook lève une exception hors d'un provider. Les providers imbriqués suivent le comportement normal de React Context : les descendants reçoivent le client du provider le plus proche.

`ClientProvider` accepte tout `ClientOption` Core :

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Fabriques d'intercepteurs

Le `withInterceptors(...)` de l'adaptateur accepte des fabriques. Il les évalue lorsque le provider crée son client et ajoute leurs résultats dans l'ordre des options.

```tsx
import type { ReactNode } from 'react'
import { createHttpInterceptor } from '@defjs/core'
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { readAccessToken } from './auth'

function createAuthInterceptor() {
  return createHttpInterceptor((request, next) => {
    const token = readAccessToken()
    if (!token) {
      return next(request)
    }

    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return next({ ...request, headers })
  })
}

export function ApiBoundary({ children }: { children: ReactNode }) {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(createAuthInterceptor)]}>{children}</ClientProvider>
  )
}
```

Le `withInterceptors(...)` Core accepte directement des intercepteurs déjà créés. Gardez les fabriques qui capturent des identifiants serveur dans la portée de la requête qui possède ces identifiants.

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

Le package ne crée pas lui-même de frontière cliente pour React Server Components. Placez `ClientProvider` derrière un module de votre application qui commence par `'use client'`.

Créez un Client Component appartenant à l'application :

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

Le code serveur qui transporte des en-têtes, des cookies, des données de tenant ou des identifiants utilisateur doit créer un client Core dans la portée de chaque requête serveur. Ne capturez pas ces valeurs dans une option de provider au niveau du module ni dans un singleton partagé entre les requêtes. L'adaptateur ne fournit pas d'isolation SSR concurrente.

Les React Server Components, Next.js, l'hydratation, Strict Mode et le SSR concurrent ajoutent leurs propres frontières de cycle de vie. Testez la configuration réelle de votre application, surtout les identifiants par requête et les remontages du provider.

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

Ce fragment suppose que `recordRealtimeFailure` est une fonction de télémétrie applicative. Il consomme volontairement `session.receive` : laisser cette file entrante non bornée sans lecteur ne constitue pas une gestion valide de la ressource. Appliquez la même discipline de démarrage et de nettoyage aux handles SSE.

Le démontage ou le remontage du provider change la portée du client. Il n'appelle pas `dispose`, n'annule aucune requête et ne ferme ni handle ni session, car le `Client` Core ne possède pas cette API de cycle de vie.

## API

```typescript
import type { Client, ClientOption, Interceptor } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  children?: ReactNode
  options?: ClientOption[]
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
declare function withEndpoint(endpoint: string): ClientOption
declare function withInterceptors(...factories: (() => Interceptor)[]): ClientOption
```

## Étapes suivantes

- [Client](/fr-FR/core/client) couvre la composition des options Core et leur portée.
- [Erreurs](/fr-FR/core/errors) couvre les frontières d'intégration qui convertissent un tuple en exception.
- [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) couvrent la responsabilité des ressources temps réel.
