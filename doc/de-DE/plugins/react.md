---
title: React
description: Teile einen Defjs-Client über React Context, konfiguriere ihn für deine API und räume Requests sowie Echtzeitressourcen aus Effects auf.
---

# `@defjs/react`

`@defjs/react` ist ein schlanker Context-Adapter für `@defjs/core`. Das Paket exportiert:

- `ClientProvider`, der einen Core-Client erzeugt und bereitstellt;
- `useClient()`, das den nächstgelegenen bereitgestellten Client zurückgibt;
- die Adapter-Helper `withEndpoint(...)` und `withInterceptors(...)` mit Interceptor-Factorys.

Der Adapter ergänzt weder Caching, Suspense-Integration, Query-Retries noch Serialisierung von Serverdaten. Installiere ihn zusammen mit `@defjs/core` und React; diese übergeordneten Aufgaben bleiben in deiner Anwendung.

## Client bereitstellen

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

Nach dem Commit behält ein Provider für die Dauer dieses Mounts denselben Client. Gewöhnliche Rerenders wenden ein geändertes `options`-Array nicht erneut an und ersetzen den Client nicht.

Die Implementierung verwendet einen Lazy-Initializer von `useState`. Verlasse dich in der Entwicklung nicht darauf, dass dieser Initializer exakt einmal läuft: React Strict Mode kann Initialisierung während des Renderns vor dem Commit mehrfach auswerten. Entscheidend ist, dass jeder Provider-Mount nach seinem Commit einen Client behält.

Erzeuge einen neuen Provider-Mount, wenn die Anwendung bewusst einen neuen Client benötigt:

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## Nächstgelegenen Client lesen

Rufe `useClient()` in einer React-Komponente oder einem eigenen Hook auf:

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

Außerhalb eines Providers wirft der Hook. Verschachtelte Provider folgen dem normalen Verhalten von React Context; Nachkommen erhalten den Client des nächstgelegenen Providers.

`ClientProvider` akzeptiert jede Core-`ClientOption`:

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Interceptor-Factorys

Das Adapter-eigene `withInterceptors(...)` akzeptiert Factorys. Es wertet sie aus, wenn der Provider seinen Client erzeugt, und hängt die Ergebnisse in Optionsreihenfolge an.

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

Core-`withInterceptors(...)` akzeptiert dagegen Interceptor-Werte. Halte Factorys mit Server-Credentials innerhalb der Request-Grenze, die diese Credentials besitzt.

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

Das Paket richtet für deine Anwendung keine Client-Grenze für React Server Components ein. Lege `ClientProvider` hinter ein anwendungseigenes Modul, das mit `'use client'` beginnt.

Erzeuge eine anwendungseigene Client Component:

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

Servercode, der Request-Header, Cookies, Mandantenstatus oder Benutzer-Credentials hält, sollte pro Server-Request-Grenze einen Core-Client erzeugen. Halte solche Werte nicht in einer Provideroption auf Modulebene oder einem Request-übergreifenden Singleton. Der Adapter stellt keine Isolation für paralleles SSR bereit.

React Server Components, Next.js, Hydration, Strict Mode und paralleles SSR bringen eigene Lifecycle-Grenzen mit. Teste die konkrete Konfiguration deiner Anwendung, besonders Request-spezifische Credentials und Provider-Remounts.

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

## Weiter

- [Client](/de-DE/core/client) behandelt Core-Optionskomposition und Scope.
- [Fehler](/de-DE/core/errors) behandelt Integrationsgrenzen zwischen Tupeln und Exceptions.
- [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) erklären die Zuständigkeit für Echtzeitressourcen.
