---
title: React
description: Comparte un cliente Defjs mediante React Context, configúralo para tu API y libera peticiones y recursos en tiempo real desde los efectos.
---

# `@defjs/react`

Este paquete es un adaptador Context ligero para `@defjs/core`. `ClientProvider` proporciona un cliente creado por la aplicación y `useClient()` devuelve la instancia más cercana. No añade una factoría de clientes, caché, reintentos ni ciclo de vida de recursos.

## Proporcionar un cliente

Crea y configura el cliente con `@defjs/core` y pasa esa instancia de forma explícita:

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

`ClientProvider` expone exactamente esa instancia. El llamador decide cuándo crearla o sustituirla y conserva la responsabilidad sobre las peticiones y recursos en tiempo real.

## Leer el cliente más cercano

Llama a `useClient()` dentro de un componente React o Hook personalizado. Lanza un error fuera de un provider y los providers anidados siguen la regla normal del Context más cercano.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

Todas las opciones de configuración proceden de `@defjs/core`:

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Funciones de creación de interceptores

Crea valores interceptor y compónlos con `withInterceptors(...)` de core antes de pasar el cliente a React:

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

Si una factoría captura credenciales de una petición, ejecútala dentro del límite de esa petición al crear el cliente.

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

La entrada del paquete es un límite Client Component. Un wrapper de la aplicación puede crear un cliente de navegador y proporcionarlo explícitamente:

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

El código de servidor con headers, cookies, estado de tenant o credenciales debe crear un cliente separado por petición. El adaptador no aísla SSR concurrente ni libera trabajo del cliente.

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
import type { Client } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  client: Client
  children?: ReactNode
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
```

Proporciona el cliente recibido a sus descendientes. `children` es opcional.

Devuelve el cliente proporcionado más cercano y lanza un error si no existe.

## Siguiente paso

- [Client](/es-ES/core/client) cubre la composición de opciones y el ámbito en Core.
- [Errores](/es-ES/core/errors) cubre los límites de integración que convierten tuplas en excepciones.
- [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) cubren la responsabilidad sobre los recursos en tiempo real.
