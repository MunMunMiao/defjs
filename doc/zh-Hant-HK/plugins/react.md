---
title: React
description: 透過 React Context 共用 Defjs client、按自己的 API 設定，並由 effect 清理 request 同 realtime resource。
---

# `@defjs/react`

此套件是 `@defjs/core` 的輕量 Context adapter。`ClientProvider` 提供由應用程式建立的 client，`useClient()` 回傳最近的 instance；它不加入 client factory、cache、retry policy 或 resource lifecycle。

## 提供 Client

使用 `@defjs/core` 建立並設定 client，再明確傳入該 instance：

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

`ClientProvider` 提供的就是傳入的同一個 instance。呼叫方決定何時建立或替換，並繼續負責由它啟動的 request 和 realtime resource。

## 讀取 Nearest Client

在 React component 或 custom Hook 內呼叫 `useClient()`。缺少 provider 時會拋錯；巢狀 provider 遵循 React Context 的 nearest-provider 規則。

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

所有設定 option 都來自 `@defjs/core`：

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Interceptor Factory

先建立 interceptor value，並用 core 的 `withInterceptors(...)` 組合，再把 client 傳給 React：

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

如果 interceptor factory 捕捉 request-scoped credential，應在建立該 client 的 request boundary 內呼叫。

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

套件入口是 Client Component boundary。應用程式自己的 wrapper 可建立 browser client 並明確提供：

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

攜帶 header、cookie、tenant state 或 credential 的 server code 應在每個 request boundary 建立獨立 client。adapter 不會隔離並行 SSR，也不會替 client 清理工作。

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

這個 fragment 假設 `recordRealtimeFailure` 是應用程式的 telemetry function。它會主動讀取 `session.receive`；一直不讀取有限 incoming queue，最終 overflow 會 fatal 終止 session。SSE handle 亦應遵循相同 startup 與 cleanup discipline。

Provider unmount/remount 會改變 client scope，但不會呼叫 `dispose`、abort request 或關閉 handle/session，因為 core `Client` 沒有這種 lifecycle API。

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

向後代提供傳入的 client；`children` 可選。

回傳最近的 client；沒有 provider 時拋錯。

## 下一步

- [Client](/zh-Hant-HK/core/client)：core option composition 與 scope。
- [Errors](/zh-Hant-HK/core/errors)：tuple-to-exception integration boundary。
- [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)：realtime resource ownership。
