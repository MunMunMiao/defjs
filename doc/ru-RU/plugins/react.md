---
title: React
description: Поставь provider, читай клиент, fetch’ни пользователя и abort при re-run effect.
---

# React

Врежь существующий клиент `@defjs/core` в React-дерево. Получаешь Context и `useClient()`. Пакет **не** создаёт клиент, не добавляет кеш, не ретраит команды и не dispose’ит transport resources. Component, effect или data library, который стартует работу, ею владеет.

## Базовая настройка

Поставь `@defjs/core`, `@defjs/react` и React 18+. ESM; Node.js 22+, когда бежишь в Node:

`bun add @defjs/core @defjs/react react`

Provide клиент, потом fetch пользователя и abort при смене:

```tsx twoslash
import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import type { ReactNode } from 'react'

const client = createClient(withEndpoint('https://api.example.com'))

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

```tsx twoslash
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'
import { useEffect, useState } from 'react'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: { 200: struct.object({ name: struct.string() }) },
})

export function UserName({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    void client.execute(getUser({ path: { id } }), { signal: controller.signal }).then(([error, user]) => {
      if (controller.signal.aborted) return
      setName(error ? undefined : user.name)
    })

    return () => controller.abort()
  }, [client, id])

  return <span>{name ?? 'Loading...'}</span>
}
```

`ClientProvider` — обычный Context provider. Другой prop `client` меняет то, что видят descendants — без clone, replace или dispose. Nested providers создают явные границы.

React в development может setup и cleanup effect больше одного раза. Проверка signal останавливает stale promise от записи в текущий render. Tuple error всё ещё data.

## Читай через `useClient`

`useClient()` возвращает ближайший `Client`. Вызывай во время render (component или custom hook). Throws, когда нет provider:

```tsx twoslash
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const health = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

export function HealthCheck() {
  const client = useClient()

  const check = async () => {
    const [error, result] = await client.execute(health())
    if (error) {
      console.error(error.kind, error.code)
      return
    }
    console.log(result.ok)
  }

  return (
    <button type="button" onClick={() => void check()}>
      Check service
    </button>
  )
}
```

Hook только отдаёт клиент. Он не стартует работу, не подписывается на транспорт и не превращает error-first кортеж в exception.

## Владей query-работой

Query library может владеть кешированием, ретраями, подавлением stale-результатов и cancellation. Отдай ей signal, который она предоставляет:

```tsx twoslash
import { defineRequest, struct } from '@defjs/core'
import { useCallback } from 'react'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: { 200: struct.object({ name: struct.string() }) },
})

export function useUserQueryFn(id: number) {
  const client = useClient()

  return useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      const [error, user] = await client.execute(getUser({ path: { id } }), { signal })
      if (error) throw error
      return user
    },
    [client, id],
  )
}
```

Не оборачивай ту же команду во второй effect — два владельца делают cancel и stale-result handling неоднозначными.

## Владей realtime-работой

SSE и WebSocket handles переживают `client.execute(...)`. Зарегистрируй cleanup до await startup, закрой handle, который пришёл после disposal, consume его единственный iterator, await terminal promise:

```tsx twoslash
import { defineWebSocket, struct } from '@defjs/core'
import { useClient } from '@defjs/react'
import { useEffect } from 'react'

const notifications = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/notifications',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
})

export function Notifications() {
  const client = useClient()

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    let closeActive: (() => void) | undefined

    void (async () => {
      const [error, session] = await client.execute(notifications(), { signal: controller.signal })
      if (error) return

      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        session.close(1000, 'effect-disposed')
      }
      closeActive = close

      if (disposed) {
        close()
        await session.closed
        return
      }

      try {
        for await (const message of session.receive) {
          console.info(message.text)
        }
      } finally {
        close()
        await session.closed
      }
    })()

    return () => {
      disposed = true
      controller.abort()
      closeActive?.()
    }
  }, [client])

  return null
}
```

То же правило для `EventStreamHandle`: close в `finally`, await `stream.closed`. WebSocket consumers также должны unsubscribe state/runtime-error listeners и продолжать читать `session.receive` — непрочитанная bounded queue может overflow.

## SSR и scope клиента

Entry пакета — граница Client Component. Browser app может шарить module-scoped клиент, когда endpoint, interceptors и captured state browser-safe и request-independent. Для SSR создавай отдельный клиент внутри каждой границы запроса, когда headers, cookies, users, tenants или credentials различаются.

Provider unmount **не** abort’ит HTTP, не закрывает SSE/WebSocket, не unsubscribe’ит listeners и не вызывает `dispose`. У `@defjs/react` нет такого lifecycle API. Код, который стартует каждую операцию, должен её закончить или отменить.

## Справка

Публичные exports из `@defjs/react`:

- `ClientProvider` — принимает `ClientProviderProps`, provides клиент, который ты передал
- `useClient` — ближайший клиент, или throws
- `ClientProviderProps` — `{ client: Client; children?: ReactNode }`

Создавай клиентов и опции в `@defjs/core`. См. [Клиент](../core/client.md), [Ошибки](../core/errors.md), [SSE](../core/sse.md) и [WebSocket](../core/web-socket.md).

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
- [Читать SSE-стрим](../recipes/consume-sse.md)
- [Открыть WebSocket-сессию](../recipes/websocket-session.md)
