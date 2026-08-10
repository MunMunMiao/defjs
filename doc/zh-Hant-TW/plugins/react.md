---
title: React
description: 透過 React Context 共用 Defjs 用戶端、依自己的 API 設定，並由 effect 清理請求與即時資源。
---

# `@defjs/react`

`@defjs/react` 是 `@defjs/core` 的輕量 context 轉接器，匯出：

- `ClientProvider`：建立並提供 core client；
- `useClient()`：回傳最近一層提供的 client；
- 轉接器的 `withEndpoint(...)`，以及攔截器 factory helper `withInterceptors(...)`。

它不會增加 cache、Suspense integration、query retry 或 server data serialization。請和 `@defjs/core`、React 一起安裝，這些應用程式層級的責任則留在自己的程式碼。

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

每次已 commit 的 provider mount 會保留一個 client。一般 rerender 不會重新套用改變後的 `options` array，也不會替換 client。

實作使用 lazy `useState` initializer。不要依賴 initializer 在開發環境只執行一次；React Strict Mode 可能在 commit 前多次 evaluate render-time initialization。真正重要的生命週期保證是：每次已 commit 的 provider mount 會提供一個持續保留的 client。

應用程式刻意需要新 client 時，請 remount provider：

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## 取得最近一層 Client

請在 React component 或 custom Hook 內呼叫 `useClient()`：

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

在 provider 外呼叫會 throw。巢狀 provider 遵循一般 React Context 行為，descendant 會拿到最近一層 provider 的 client。

`ClientProvider` 接受任何 core `ClientOption`：

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## 攔截器 Factory

Adapter 的 `withInterceptors(...)` 接受 factory。Provider 建立 client 時會 evaluate 它們，再依 option order 附加結果。

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

Core `withInterceptors(...)` 接受 interceptor value。伺服器 credential factory 必須放在擁有這些 credential 的 request boundary 內。

## 管理 HTTP Effect

在 effect 內建立 cancellation，cleanup 後抵達的結果不要再處理：

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

Defjs 會把預期內的 request failure 放進 tuple。只有在需要 exception 的整合邊界，例如 query library 的 `queryFn`，才把 error 轉成 thrown value。

## Client Component 邊界

套件不會替應用程式建立 React Server Component client boundary。請把 `ClientProvider` 放在應用程式自行維護、以 `'use client'` 開頭的 module 後面。

請建立應用程式自己的 Client Component：

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

伺服器程式碼如果帶有 request header、cookie、tenant state 或使用者 credential，應在每個 server request boundary 內建立 core client。不要把這些值捕捉進 module-level provider option 或跨 request singleton。Adapter 不提供 concurrent SSR isolation。

React Server Components、Next.js、hydration、Strict Mode 與 concurrent SSR 都有各自的 framework 生命週期邊界。請用應用程式的實際設定測試，尤其要涵蓋 request-scoped credential 與 provider remount。

## 管理 Realtime Effect

Provider unmount 不會關閉 descendant 啟動的資源。開啟 WebSocket 的 effect 必須 abort startup、關閉延遲抵達的 session、消費 incoming queue、unsubscribe observer，並關閉 active session。

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

這個 fragment 假設 `recordRealtimeFailure` 是應用程式的 telemetry function。它刻意消費 `session.receive`；若有限 incoming queue 完全沒人讀取，最終 overflow 會 fatal 終止 session。SSE handle 也要套用相同的 startup 與 cleanup 原則。

Provider unmount/remount 會改變 client scope，但不會呼叫 `dispose`、abort request 或關閉 handle 與 session，因為 core `Client` 沒有這種 lifecycle API。

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

- [Client](/zh-Hant-TW/core/client)說明 core option composition 與 scope。
- [錯誤](/zh-Hant-TW/core/errors)說明 tuple-to-exception 的整合邊界。
- [SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)說明 realtime 資源歸屬。
