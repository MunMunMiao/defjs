---
title: React
description: 透過 React Context 共用 Defjs client、按自己的 API 設定，並由 effect 清理 request 同 realtime resource。
---

# `@defjs/react`

`@defjs/react` 是 `@defjs/core` 的輕量 context adapter，匯出：

- `ClientProvider`：建立並提供 core client；
- `useClient()`：回傳 nearest provided client；
- adapter `withEndpoint(...)` 與 interceptor-factory `withInterceptors(...)` helper。

它不會加入 cache、Suspense integration、query retry 或 server data serialization。請連同 `@defjs/core`、React 一起安裝，這些上層責任則留在自己的 application code。

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

Provider mount commit 後會保留一個 client。一般 rerender 不會重新套用已改變的 `options` array，亦不會取代 client。

實作使用 lazy `useState` initializer。不要依賴 initializer 在 development 恰好只執行一次：React Strict Mode 可能在 commit 前重複執行 render-time initialization。真正的 lifecycle guarantee 是，一個 committed provider mount 對外提供一個 retained client。

應用程式確實需要新 client 時，請 remount provider：

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## 讀取 Nearest Client

在 React component 或 custom Hook 內呼叫 `useClient()`：

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

在 provider 外呼叫會拋錯。Nested provider 遵循一般 React Context behavior；descendant 會取得 nearest provider 的 client。

`ClientProvider` 接受任何 core `ClientOption`：

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Interceptor Factory

Adapter `withInterceptors(...)` 接受 factory。Provider 建立 client 時會執行 factory，並按 option order 追加結果。

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

Core `withInterceptors(...)` 接受 interceptor value。Server 端 credential factory 必須留在擁有該 credentials 的 request boundary。

## 管理 HTTP Effect

在 effect 內建立 cancellation，並忽略 cleanup 後才完成的結果：

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

Defjs 透過 tuple 回傳預期內的 request failure。只有 integration boundary 需要 exception 時才 throw，例如 query library 的 `queryFn`。

## Client Component Boundary

Package 不會替應用程式建立 React Server Component client boundary。請把 `ClientProvider` 放在應用程式自己維護、以 `'use client'` 開頭的 module 後面。

請建立由應用程式擁有的 Client Component：

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

攜帶 request header、cookie、tenant state 或 user credentials 的伺服器端程式碼，必須在每個 server request boundary 內建立 core client。不要讓這些值被 capture 到 module-level provider option 或 cross-request singleton。Adapter 不提供 concurrent SSR isolation。

React Server Component、Next.js、hydration、Strict Mode 同 concurrent SSR 都有各自的 framework lifecycle boundary。請用應用程式的實際設定測試，尤其要覆蓋 request-scoped credentials 同 provider remount。

## 管理 Realtime Effect

Provider unmount 不會關閉 descendant 開始的資源。開啟 WebSocket 的 effect 必須 abort startup、關閉 late-arriving session、讀取 incoming queue、unsubscribe observer，並關閉 active session。

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

這個 fragment 假設 `recordRealtimeFailure` 是應用程式的 telemetry function。它會主動讀取 `session.receive`；一直不讀取這個無界 incoming queue 並非有效 ownership pattern。SSE handle 亦應遵循相同 startup 與 cleanup discipline。

Provider unmount/remount 會改變 client scope，但不會呼叫 `dispose`、abort request 或關閉 handle/session，因為 core `Client` 沒有這種 lifecycle API。

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

- [Client](/zh-Hant-HK/core/client)：core option composition 與 scope。
- [Errors](/zh-Hant-HK/core/errors)：tuple-to-exception integration boundary。
- [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)：realtime resource ownership。
