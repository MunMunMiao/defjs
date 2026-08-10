---
title: React
description: Comparte un cliente Defjs mediante React Context, configúralo para tu API y libera peticiones y recursos en tiempo real desde los efectos.
---

# `@defjs/react`

`@defjs/react` es un adaptador ligero de contexto para `@defjs/core`. Exporta:

- `ClientProvider`, que crea y proporciona un cliente de Core;
- `useClient()`, que devuelve el cliente más cercano del árbol;
- los helpers del adaptador `withEndpoint(...)` y `withInterceptors(...)`; este último acepta funciones que crean interceptores.

No añade caché, integración con Suspense, reintentos de queries ni serialización de datos del servidor. Instálalo junto a `@defjs/core` y React, y mantén esas responsabilidades de aplicación en tu propio código.

## Proporcionar un cliente

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

Cada montaje confirmado del provider conserva un cliente. Los rerenders normales no vuelven a aplicar un array `options` distinto ni sustituyen el cliente.

La implementación utiliza un inicializador perezoso de `useState`. No dependas de que se ejecute exactamente una vez durante el desarrollo: React Strict Mode puede evaluar la inicialización durante el render más de una vez antes de confirmar el montaje. La garantía relevante es que cada montaje confirmado del provider expone un único cliente conservado.

Vuelve a montar el provider cuando la aplicación necesite deliberadamente un cliente nuevo:

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## Leer el cliente más cercano

Llama a `useClient()` dentro de un componente React o de un Hook personalizado:

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

Lanza una excepción fuera de un provider. Los providers anidados siguen el comportamiento normal de React Context: cada descendiente recibe el cliente del provider más cercano.

`ClientProvider` acepta cualquier `ClientOption` de Core:

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Funciones de creación de interceptores

El `withInterceptors(...)` del adaptador acepta funciones de creación. Las evalúa cuando el provider crea su cliente y añade sus resultados en el orden de las opciones.

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

El `withInterceptors(...)` de Core acepta directamente los valores de interceptor. En servidor, mantén las funciones que obtengan credenciales dentro del límite de la petición a la que pertenecen.

## Controlar los efectos HTTP

Crea la cancelación dentro del efecto e ignora cualquier finalización posterior a su limpieza:

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

Defjs devuelve en tuplas los fallos previstos de una petición. Convierte el error en una excepción solo en un límite de integración que la espere, como la `queryFn` de una librería de queries.

## Límite de Client Component

El paquete no crea por sí solo un límite cliente para React Server Components. Coloca `ClientProvider` detrás de un módulo de tu aplicación que empiece por `'use client'`.

Crea un Client Component controlado por la aplicación:

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

El código de servidor que maneje cabeceras de petición, cookies, estado del tenant o credenciales de usuario debe crear un cliente de Core dentro del límite de cada petición del servidor. No captures esos valores en una opción de provider a nivel de módulo ni en un singleton compartido entre peticiones. El adaptador no proporciona aislamiento para SSR concurrente.

React Server Components, Next.js, la hidratación, Strict Mode y el SSR concurrente añaden límites de ciclo de vida propios. Prueba la configuración real de tu aplicación, sobre todo las credenciales por petición y los remounts del provider.

## Controlar los efectos en tiempo real

Desmontar un provider no cierra los recursos iniciados por sus descendientes. Un efecto que abra un WebSocket debe cancelar el arranque, cerrar cualquier sesión que llegue tarde, consumir la cola de entrada, dar de baja los observadores y cerrar la sesión activa.

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

Este fragmento da por hecho que `recordRealtimeFailure` es una función de telemetría de la aplicación. Consume `session.receive` de forma intencionada; si la cola de entrada finita queda sin lector, su desbordamiento termina la sesión de forma fatal. Aplica la misma disciplina de arranque y limpieza a los manejadores SSE.

Desmontar y volver a montar el provider cambia el ámbito del cliente. No llama a `dispose`, no cancela peticiones y no cierra manejadores ni sesiones, porque `Client` de Core no tiene una API de ciclo de vida de ese tipo.

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

## Siguiente paso

- [Client](/es-ES/core/client) cubre la composición de opciones y el ámbito en Core.
- [Errores](/es-ES/core/errors) cubre los límites de integración que convierten tuplas en excepciones.
- [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) cubren la responsabilidad sobre los recursos en tiempo real.
