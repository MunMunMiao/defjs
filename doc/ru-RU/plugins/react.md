---
title: React
description: Интеграция React — ClientProvider, useClient и option helpers для совместного использования типизированных клиентов @defjs/core в React-приложениях.
---

# @defjs/react

`@defjs/react` интегрирует `@defjs/core` с React. Он один раз создаёт `Client`, передаёт его через React Context и позволяет дочерним компонентам получать его через `useClient()`.

Используйте его, когда React-приложению нужен общий типизированный client для HTTP-, SSE- или WebSocket-команд.

## Установка

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

`react` является peer dependency. `@defjs/react` поддерживает React 18 и новее.

## Предоставление Client

Оберните часть дерева компонентов, которой нужен client, в `ClientProvider`.

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

`ClientProvider` создаёт client `@defjs/core` из переданных options и сохраняет его в приватном React Context.

## Использование Client

Вызовите `useClient()` внутри дочернего компонента, чтобы получить ближайший предоставленный client.

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

Если `useClient()` вызван вне `ClientProvider`, он выбрасывает runtime-ошибку, чтобы отсутствующий provider был заметен сразу.

## Option Helpers

`withEndpoint` и `withInterceptors` — helpers из React-пакета, которые создают client options для `@defjs/core`.

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

`withInterceptors` принимает factory-функции. Каждая factory возвращает interceptor, а получившиеся interceptors регистрируются в созданном client.

## Client Components

React wrapper помечен `"use client"`. В React Server Component-приложениях рендерите `ClientProvider` из границы client component.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## Справочник API

### `<ClientProvider options?: ClientOption[]>`

Создаёт client и предоставляет его дочерним компонентам. Options вычисляются, когда provider создаёт client.

### `useClient(): Client`

Возвращает client из ближайшего `ClientProvider`. Выбрасывает ошибку, если provider не найден.

### `withEndpoint(endpoint: string): ClientOption`

Задаёт базовый endpoint URL для client.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Регистрирует interceptors через factory-функции.

## Примечания

- Требуется React 18 или новее.
- `ClientProvider` должен находиться в client component-коде.
- `useClient()` должен выполняться ниже `ClientProvider`.
- `@defjs/react` не меняет модель request, command, interceptor или error из `@defjs/core`.

## Что дальше

- [Клиент →](/core/client) — Создание и конфигурация Client
- [Интерцепторы →](/core/interceptors) — Цепочки interceptor в луковичной модели
- [Команды →](/core/commands) — Определения HTTP-, SSE- и WebSocket-command
