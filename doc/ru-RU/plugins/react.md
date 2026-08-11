---
title: React
description: Передавайте клиент Defjs через React Context, настраивайте его для своего API и освобождайте запросы и realtime-ресурсы из эффектов.
---

# `@defjs/react`

Этот пакет — тонкий Context-адаптер для `@defjs/core`. `ClientProvider` предоставляет созданный приложением клиент, а `useClient()` возвращает ближайший экземпляр. Пакет не добавляет фабрику клиентов, кеш, retry или управление ресурсами.

## Предоставление клиента

Создайте и настройте клиент через `@defjs/core`, затем явно передайте этот экземпляр:

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

`ClientProvider` предоставляет именно переданный экземпляр. Вызывающий код решает, когда создавать или заменять его, и отвечает за запросы и realtime-ресурсы.

## Чтение ближайшего клиента

Вызывайте `useClient()` внутри React-компонента или собственного Hook. Вне provider функция бросает ошибку; вложенные providers следуют обычному правилу ближайшего React Context.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

Все параметры конфигурации берутся из `@defjs/core`:

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Фабрики перехватчиков

Создайте значения interceptor и скомпонуйте их core-функцией `withInterceptors(...)` до передачи клиента в React:

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

Если фабрика захватывает учетные данные запроса, вызывайте её внутри границы запроса, создающей этот клиент.

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

Точка входа пакета является границей Client Component. Обёртка приложения может создать браузерный клиент и явно предоставить его:

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

Серверный код с headers, cookies, tenant state или credentials должен создавать отдельный клиент в каждой границе запроса. Адаптер не изолирует параллельный SSR и не освобождает работу клиента.

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

Фрагмент предполагает, что `recordRealtimeFailure` — функция телеметрии приложения. Он намеренно читает `session.receive`: если конечную входящую очередь не читать, переполнение фатально завершит сеанс. Для хендлов SSE используйте ту же дисциплину запуска и очистки.

Размонтирование и повторное монтирование провайдера меняет область клиента. Оно не вызывает `dispose`, не отменяет запросы и не закрывает хендлы или сеансы, потому что у core `Client` нет такого API жизненного цикла.

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

Предоставляет переданный клиент потомкам. `children` необязателен.

Возвращает ближайший предоставленный клиент и бросает ошибку при его отсутствии.

## Что дальше

- [Клиент](/ru-RU/core/client) — композиция core-опций и область клиента.
- [Ошибки](/ru-RU/core/errors) — интеграционные границы между кортежами и исключениями.
- [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket) — владение ресурсами реального времени.
