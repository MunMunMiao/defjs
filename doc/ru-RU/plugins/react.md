---
title: React
description: Передавайте клиент Defjs через React Context, настраивайте его для своего API и освобождайте запросы и realtime-ресурсы из эффектов.
---

# `@defjs/react`

`@defjs/react` — тонкий Context-адаптер для `@defjs/core`. Он экспортирует:

- `ClientProvider`, который создаёт и предоставляет core-клиент;
- `useClient()`, который возвращает ближайший предоставленный клиент;
- адаптерные функции `withEndpoint(...)` и `withInterceptors(...)`, последняя принимает фабрики перехватчиков.

Адаптер не добавляет кэширование, интеграцию с Suspense, повторы запросов или сериализацию серверных данных. Установите его вместе с `@defjs/core` и React, а эти обязанности приложения оставьте в своём коде.

## Предоставление клиента

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

После commit-фазы одного монтирования провайдер сохраняет один клиент. Обычный повторный рендер не применяет заново изменившийся массив `options` и не заменяет клиент.

Реализация использует ленивую функцию инициализации `useState`. Не рассчитывайте, что в режиме разработки она выполнится строго один раз: React Strict Mode может несколько раз вычислить начальное состояние во время рендера до commit-фазы. Существенная гарантия жизненного цикла: каждое монтирование провайдера, дошедшее до commit-фазы, предоставляет один сохранённый клиент.

Перемонтируйте провайдер, когда приложению намеренно нужен новый клиент:

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## Чтение ближайшего клиента

Вызывайте `useClient()` внутри React-компонента или пользовательского хука:

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

Вне провайдера функция выбрасывает ошибку. Вложенные провайдеры подчиняются обычному поведению React Context: потомки получают клиент ближайшего провайдера.

`ClientProvider` принимает любые core `ClientOption`:

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Фабрики перехватчиков

Адаптерный `withInterceptors(...)` принимает фабрики. Он вызывает их при создании клиента провайдером и добавляет результаты в порядке опций.

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

Core `withInterceptors(...)` принимает готовые перехватчики. На сервере держите фабрики с учётными данными внутри границы запроса, которому принадлежат эти данные.

## Управление жизненным циклом HTTP-эффектов

Создавайте отмену внутри эффекта и игнорируйте завершение после его очистки:

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

Ожидаемые ошибки запросов Defjs возвращает в кортежах. Преобразуйте ошибку в исключение только на интеграционной границе, которая ожидает исключения, например в `queryFn` библиотеки query.

## Граница Client Component

Пакет не создаёт клиентскую границу React Server Components за приложение. Разместите `ClientProvider` за модулем приложения, который начинается с `'use client'`.

Создайте собственный Client Component приложения:

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

Серверный код, который содержит заголовки запроса, cookie, данные арендатора или учётные данные пользователя, должен создавать core-клиент внутри границы каждого серверного запроса. Не захватывайте такие значения в опции провайдера на уровне модуля или в общем между запросами синглтоне. Адаптер не обеспечивает изоляцию параллельных SSR-запросов.

React Server Components, Next.js, hydration, Strict Mode и параллельный SSR добавляют собственные границы жизненного цикла. Тестируйте реальную конфигурацию приложения, особенно учётные данные на запрос и повторное монтирование provider.

## Управление жизненным циклом эффектов реального времени

Размонтирование провайдера не закрывает ресурсы, запущенные потомками. Эффект, который открывает WebSocket, должен отменить запуск, закрыть поздно вернувшийся сеанс, читать входящую очередь, удалить наблюдателей и закрыть активный сеанс.

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

Фрагмент предполагает, что `recordRealtimeFailure` — функция телеметрии приложения. Он намеренно читает `session.receive`: оставлять неограниченную входящую очередь непрочитанной нельзя. Для хендлов SSE используйте ту же дисциплину запуска и очистки.

Размонтирование и повторное монтирование провайдера меняет область клиента. Оно не вызывает `dispose`, не отменяет запросы и не закрывает хендлы или сеансы, потому что у core `Client` нет такого API жизненного цикла.

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

## Что дальше

- [Клиент](/ru-RU/core/client) — композиция core-опций и область клиента.
- [Ошибки](/ru-RU/core/errors) — интеграционные границы между кортежами и исключениями.
- [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket) — владение ресурсами реального времени.
