---
title: React
description: 通过 React Context 共享 Defjs client，按自己的 API 配置它，并从 effect 清理请求和实时资源。
---

# `@defjs/react`

该包是 `@defjs/core` 的轻量 Context 适配器。`ClientProvider` 提供由应用创建的 client，`useClient()` 返回最近的实例；它不增加 client 工厂、缓存、重试策略或资源生命周期。

## 提供 Client

使用 `@defjs/core` 创建并配置 client，再显式传入该实例：

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

`ClientProvider` 提供的就是传入的同一个实例。调用方决定何时创建或替换它，并继续负责由它启动的请求和实时资源。

## 读取最近的 Client

在 React 组件或自定义 Hook 内调用 `useClient()`。缺少 provider 时它会抛错；嵌套 provider 遵循 React Context 的最近层级规则。

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

所有配置选项都来自 `@defjs/core`：

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Interceptor Factory

先创建 interceptor 值，并用 core 的 `withInterceptors(...)` 组合，再把 client 传给 React：

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

如果 interceptor 工厂捕获请求级凭据，应在创建该 client 的请求边界内调用它。

## 管理 HTTP Effect

在 effect 内创建 cancellation，并忽略 cleanup 后才完成的结果：

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

Defjs 通过 tuple 返回预期内的 request failure。只有集成边界需要异常时才 throw，例如 query library 的 `queryFn`。

## Client Component 边界

包入口属于 Client Component 边界。应用自己的 wrapper 可以创建浏览器 client 并显式提供：

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

携带 header、cookie、tenant 状态或凭据的服务端代码应在每个请求边界内创建独立 client。适配器不会隔离并发 SSR，也不会替 client 清理工作。

## 管理 Realtime Effect

Provider unmount 不会关闭后代发起的资源。打开 WebSocket 的 effect 必须 abort startup、关闭晚到的 session、消费 incoming queue、unsubscribe observer，并关闭 active session。

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

这个 fragment 假设 `recordRealtimeFailure` 是应用 telemetry function。它会主动消费 `session.receive`；让有限 incoming queue 一直无人读取，最终 overflow 会 fatal 终止 session。SSE handle 也应遵循同样的 startup 和 cleanup 纪律。

Provider unmount/remount 会改变 client scope，但不会调用 `dispose`、abort request 或关闭 handle/session，因为 core `Client` 没有这样的生命周期 API。

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

向后代提供传入的 client；`children` 可选。

返回最近的 client；没有 provider 时抛错。

## 下一步

- [Client](/zh-Hans/core/client)：core option 组合和作用域。
- [Errors](/zh-Hans/core/errors)：tuple 到 exception 的集成边界。
- [SSE](/zh-Hans/core/sse) 与 [WebSocket](/zh-Hans/core/web-socket)：realtime 资源所有权。
