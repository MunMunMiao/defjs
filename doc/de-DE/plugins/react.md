---
title: React
description: Teile einen Defjs-Client über React Context, konfiguriere ihn für deine API und räume Requests sowie Echtzeitressourcen aus Effects auf.
---

# `@defjs/react`

Dieses Paket ist ein dünner Context-Adapter für `@defjs/core`. `ClientProvider` stellt einen von der Anwendung erzeugten Client bereit, und `useClient()` liefert die nächstgelegene Instanz. Es fügt weder Client-Factory noch Cache, Retry-Policy oder Ressourcen-Lifecycle hinzu.

## Client bereitstellen

Erzeuge und konfiguriere den Client mit `@defjs/core` und übergib die Instanz explizit:

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

`ClientProvider` stellt exakt diese Instanz bereit. Der Aufrufer entscheidet über Erzeugung und Austausch und besitzt weiterhin Requests und Echtzeitressourcen.

## Nächstgelegenen Client lesen

Rufe `useClient()` in einer React-Komponente oder einem eigenen Hook auf. Ohne Provider wird ein Fehler ausgelöst; verschachtelte Provider folgen der normalen Nearest-Provider-Regel von React Context.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

Alle Konfigurationsoptionen kommen aus `@defjs/core`:

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Interceptor-Factorys

Erzeuge Interceptor-Werte und kombiniere sie mit dem Core-`withInterceptors(...)`, bevor du den Client an React übergibst:

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

Wenn eine Factory request-spezifische Zugangsdaten erfasst, rufe sie innerhalb der Request-Grenze auf, die den Client erzeugt.

## HTTP-Effects verwalten

Erzeuge den Abbruch im Effect und ignoriere Ergebnisse nach dem Cleanup:

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

Defjs gibt erwartete Request-Fehler in Tupeln zurück. Wandle einen Fehler nur an einer Integrationsgrenze in eine geworfene Exception um, die Exceptions erwartet, etwa in der `queryFn` einer Query-Bibliothek.

## Client-Component-Grenze

Der Paketeinstieg ist eine Client-Component-Grenze. Ein anwendungseigener Wrapper kann einen Browser-Client erzeugen und explizit bereitstellen:

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

Servercode mit Headern, Cookies, Tenant-Zustand oder Zugangsdaten sollte pro Request-Grenze einen eigenen Client erzeugen. Der Adapter isoliert keine parallelen SSR-Requests und räumt Client-Arbeit nicht auf.

## Echtzeit-Effects verwalten

Das Unmounten eines Providers schließt keine Ressourcen, die Nachkommen gestartet haben. Ein Effect, der einen WebSocket öffnet, muss den Start abbrechen, eine spät eintreffende Session schließen, die eingehende Warteschlange konsumieren, Beobachter entfernen und die aktive Session schließen.

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

Dieses Fragment nimmt an, dass `recordRealtimeFailure` eine Telemetriefunktion der Anwendung ist. Es konsumiert `session.receive` absichtlich; bleibt die begrenzte eingehende Warteschlange ungelesen, beendet ein Overflow die Session fatal. Wende dieselbe Disziplin für Start und Cleanup auf SSE-Handles an.

Unmount und erneuter Mount des Providers ändern den Client-Scope. Sie rufen weder `dispose` auf noch brechen sie Requests ab oder schließen Handles und Sessions, denn der Core-`Client` hat keine solche Lebenszyklus-API.

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

Stellt den übergebenen Client für Nachfahren bereit. `children` ist optional.

Liefert den nächstgelegenen Client und wirft ohne Provider einen Fehler.

## Weiter

- [Client](/de-DE/core/client) behandelt Core-Optionskomposition und Scope.
- [Fehler](/de-DE/core/errors) behandelt Integrationsgrenzen zwischen Tupeln und Exceptions.
- [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) erklären die Zuständigkeit für Echtzeitressourcen.
