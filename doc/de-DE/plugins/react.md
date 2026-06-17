---
title: React
description: React-Integration — ClientProvider, useClient und Option-Helper zum Teilen typisierter @defjs/core Clients in React-Anwendungen.
---

# @defjs/react

`@defjs/react` integriert `@defjs/core` in React. Es erstellt einmal einen `Client`, stellt ihn über React Context bereit und lässt Kindkomponenten ihn mit `useClient()` lesen.

Verwende es, wenn eine React-Anwendung einen gemeinsamen typisierten Client für HTTP-, SSE- oder WebSocket-Commands benötigt.

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

`react` ist eine Peer Dependency. `@defjs/react` unterstützt React 18 und neuer.

## Client bereitstellen

Umschließe den Teil des Komponentenbaums, der den Client benötigt, mit `ClientProvider`.

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

`ClientProvider` erstellt aus den übergebenen Options einen `@defjs/core` Client und speichert ihn in einem privaten React Context.

## Client verwenden

Rufe `useClient()` in einer Kindkomponente auf, um den nächsten bereitgestellten Client abzurufen.

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

Wenn `useClient()` außerhalb von `ClientProvider` aufgerufen wird, wirft es einen Laufzeitfehler, damit der fehlende Provider sofort sichtbar ist.

## Option Helpers

`withEndpoint` und `withInterceptors` sind Helper aus dem React-Paket, die `@defjs/core` Client Options erzeugen.

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

`withInterceptors` akzeptiert Factory-Funktionen. Jede Factory gibt einen Interceptor zurück, und die resultierenden Interceptors werden am erstellten Client registriert.

## Client Components

Der React-Wrapper ist mit `"use client"` markiert. In React-Server-Component-Anwendungen rendere `ClientProvider` aus einer Client-Component-Grenze.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API-Referenz

### `<ClientProvider options?: ClientOption[]>`

Erstellt einen Client und stellt ihn Kindkomponenten bereit. Options werden ausgewertet, wenn der Provider den Client erstellt.

### `useClient(): Client`

Gibt den Client aus dem nächsten `ClientProvider` zurück. Wirft, wenn kein Provider gefunden wird.

### `withEndpoint(endpoint: string): ClientOption`

Setzt die Basis-Endpoint-URL für den Client.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registriert Interceptors über Factory-Funktionen.

## Hinweise

- React 18 oder neuer ist erforderlich.
- `ClientProvider` gehört in Client-Component-Code.
- `useClient()` muss unterhalb eines `ClientProvider` laufen.
- `@defjs/react` ändert das Request-, Command-, Interceptor- oder Fehlermodell von `@defjs/core` nicht.

## Wie geht es weiter

- [Client →](/core/client) — Client-Erstellung und Konfiguration
- [Interceptors →](/core/interceptors) — Interceptor-Ketten im Zwiebelmodell
- [Commands →](/core/commands) — HTTP-, SSE- und WebSocket-Command-Definitionen
