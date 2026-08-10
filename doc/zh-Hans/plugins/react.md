---
title: React
description: 通过 React Context 共享 Defjs client，按自己的 API 配置它，并从 effect 清理请求和实时资源。
---

# `@defjs/react`

`@defjs/react` 是 `@defjs/core` 的轻量 context adapter。它导出：

- `ClientProvider`：创建并提供 core client；
- `useClient()`：返回最近一层提供的 client；
- adapter `withEndpoint(...)` 和 interceptor-factory `withInterceptors(...)` helper。

它不会添加 cache、Suspense integration、query retry 或 server data serialization。请和 `@defjs/core`、React 一起安装，并在自己的应用代码里管理这些上层职责。

## 提供 Client

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

Provider mount 一旦 commit，就会保留一个 client。普通 rerender 不会重新应用变化后的 `options` array，也不会替换 client。

实现使用 lazy `useState` initializer。不要依赖该 initializer 在开发环境中恰好只运行一次：React Strict Mode 可能在 commit 前多次执行 render-time initialization。真正的生命周期保证是：一个已 commit 的 provider mount 对外提供一个保留下来的 client。

应用确实需要新 client 时，remount provider：

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## 读取最近的 Client

在 React component 或 custom Hook 内调用 `useClient()`：

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

Provider 外调用会抛错。嵌套 provider 遵循正常 React Context 行为，后代会得到最近一层 provider 的 client。

`ClientProvider` 接受任意 core `ClientOption`：

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Interceptor Factory

Adapter 的 `withInterceptors(...)` 接受 factory。Provider 创建 client 时会执行这些 factory，并按 option 顺序追加结果。

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

Core `withInterceptors(...)` 接受 interceptor value。服务端 credential factory 必须放在拥有这些 credential 的请求边界内。

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

Package 不会替应用建立 React Server Component client boundary。请把 `ClientProvider` 放在应用自己维护、以 `'use client'` 开头的 module 后面。

请创建应用自己拥有的 Client Component：

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

携带 request header、cookie、tenant state 或 user credential 的服务端代码，必须在每个服务端请求边界内创建 core client。不要把这些值捕获到 module-level provider option 或跨请求 singleton。Adapter 不提供并发 SSR 隔离。

React Server Component、Next.js、hydration、Strict Mode 和并发 SSR 都有各自的 framework 生命周期边界。请在应用的实际配置中测试，尤其要覆盖 request-scoped credential 和 provider remount。

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

## 下一步

- [Client](/zh-Hans/core/client)：core option 组合和作用域。
- [Errors](/zh-Hans/core/errors)：tuple 到 exception 的集成边界。
- [SSE](/zh-Hans/core/sse) 与 [WebSocket](/zh-Hans/core/web-socket)：realtime 资源所有权。
