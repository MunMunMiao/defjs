---
title: React
description: React Context で Defjs クライアントを共有し、API に合わせて設定し、Effect からリクエストとリアルタイムリソースを片付けます。
---

# `@defjs/react`

このパッケージは `@defjs/core` 用の薄い Context アダプターです。`ClientProvider` はアプリケーションが作成した client を提供し、`useClient()` は最も近い instance を返します。client factory、cache、retry、resource lifecycle は追加しません。

## クライアントを提供する

`@defjs/core` で client を作成・設定し、その instance を明示的に渡します。

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

`ClientProvider` は渡されたものと同一の instance を公開します。作成と差し替えの時期、および request と realtime resource の lifecycle は呼び出し側が所有します。

## 最も近いクライアントを読む

`useClient()` は React component または custom Hook 内で呼び出します。provider の外では例外になり、ネストした provider は通常の React Context の最寄り規則に従います。

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

設定 option はすべて `@defjs/core` から使用します。

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## インターセプターファクトリー

interceptor value を作り、core の `withInterceptors(...)` で合成してから client を React に渡します。

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

factory が request 固有の credential を捕捉する場合は、その client を作成する request boundary 内で呼び出してください。

## HTTP エフェクトのライフサイクルを管理する

エフェクト内でキャンセルを作り、クリーンアップ後の完了結果を無視します。

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

Defjs は想定されるリクエスト失敗をタプルで返します。クエリライブラリの `queryFn` など、例外を期待する統合境界でだけエラーを例外へ変換してください。

## Client Component 境界

パッケージ entry は Client Component boundary です。アプリケーション所有の wrapper で browser client を作成して明示的に提供できます。

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

header、cookie、tenant state、credential を扱う server code は request boundary ごとに別の client を作成してください。アダプターは並行 SSR を分離せず、client の処理も破棄しません。

## リアルタイム処理のライフサイクルを管理する

プロバイダーのアンマウントは、子孫が開始したリソースをクローズしません。WebSocket を開くエフェクトは、起動を中断し、遅れて届いたセッションをクローズし、受信キューを消費し、オブザーバーの購読を解除し、アクティブなセッションをクローズする必要があります。

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

このコード片では、`recordRealtimeFailure` をアプリケーションのテレメトリー関数としています。`session.receive` を意図的に消費しています。有限の受信キューを未読のままにすると、オーバーフローがセッションを致命的に終了します。SSE ハンドルにも同じ起動・クリーンアップ規則を適用してください。

プロバイダーのアンマウントや再マウントはクライアントスコープを変えます。ただし、`dispose`、リクエストの中断、ハンドルやセッションのクローズは行いません。Core `Client` にそのライフサイクル API がないためです。

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

渡された client を descendants に提供します。`children` は任意です。

最も近い client を返し、存在しなければ例外を投げます。

## 次に読む

- [Client](/ja-JP/core/client) — Core オプション合成とスコープ
- [Errors](/ja-JP/core/errors) — タプルを例外へ変換する統合境界
- [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) — リアルタイムリソースの所有権
