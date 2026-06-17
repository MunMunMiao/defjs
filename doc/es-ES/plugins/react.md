---
title: React
description: Integración con React — ClientProvider, useClient y option helpers para compartir clientes @defjs/core tipados en aplicaciones React.
---

# @defjs/react

`@defjs/react` integra `@defjs/core` con React. Crea un `Client` una sola vez, lo expone mediante React Context y permite que los componentes hijos lo lean con `useClient()`.

Úsalo cuando una aplicación React necesite compartir un cliente tipado para comandos HTTP, SSE o WebSocket.

## Instalación

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

`react` es una peer dependency. `@defjs/react` soporta React 18 y versiones posteriores.

## Proveer Client

Envuelve la parte del árbol de componentes que necesita el client con `ClientProvider`.

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

`ClientProvider` crea un cliente `@defjs/core` desde las options proporcionadas y lo guarda en un React Context privado.

## Usar Client

Llama a `useClient()` dentro de un componente hijo para recuperar el client provisto más cercano.

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

Si `useClient()` se llama fuera de `ClientProvider`, lanza un error en runtime para que el provider faltante sea visible inmediatamente.

## Option Helpers

`withEndpoint` y `withInterceptors` son helpers del paquete React que producen client options de `@defjs/core`.

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

`withInterceptors` acepta funciones factory. Cada factory devuelve un interceptor, y los interceptors resultantes se registran en el client creado.

## Client Components

El wrapper de React está marcado con `"use client"`. En aplicaciones React Server Component, renderiza `ClientProvider` desde un límite de client component.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## Referencia de API

### `<ClientProvider options?: ClientOption[]>`

Crea un client y lo proporciona a los componentes hijos. Las options se evalúan cuando el provider crea el client.

### `useClient(): Client`

Devuelve el client del `ClientProvider` más cercano. Lanza un error si no se encuentra un provider.

### `withEndpoint(endpoint: string): ClientOption`

Configura la URL base del endpoint para el client.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registra interceptors mediante funciones factory.

## Notas

- Se requiere React 18 o una versión posterior.
- `ClientProvider` pertenece al código de client component.
- `useClient()` debe ejecutarse debajo de un `ClientProvider`.
- `@defjs/react` no cambia el modelo de request, command, interceptor ni error de `@defjs/core`.

## Próximos pasos

- [Cliente →](/core/client) — Creación y configuración de Client
- [Interceptores →](/core/interceptors) — Cadenas de interceptor con modelo cebolla
- [Comandos →](/core/commands) — Definiciones de commands HTTP, SSE y WebSocket
