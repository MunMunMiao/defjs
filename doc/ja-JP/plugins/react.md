---
title: React
description: React Context で Defjs クライアントを共有し、API に合わせて設定し、Effect からリクエストとリアルタイムリソースを片付けます。
---

# `@defjs/react`

`@defjs/react` は `@defjs/core` 用の薄いコンテキストアダプターです。次をエクスポートします。

- `ClientProvider`: Core クライアントを作成して提供するコンポーネント
- `useClient()`: 最も近いプロバイダーのクライアントを返す Hook
- アダプターの `withEndpoint(...)` と、インターセプターファクトリー用の `withInterceptors(...)` ヘルパー

キャッシュ、Suspense 統合、クエリの再試行、サーバーデータのシリアライズは追加しません。`@defjs/core` と React と一緒にインストールし、これらのアプリケーション責務は自分のコードで管理してください。

## クライアントを提供する

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

コミット済みのプロバイダーのマウントは、クライアントを 1 つ保持します。通常の再レンダーでは、変更された `options` 配列を再適用せず、クライアントも置き換えません。

実装は遅延評価する `useState` initializer を使います。ただし、開発環境で initializer が正確に 1 回だけ実行されることには依存しないでください。React Strict Mode は、コミット前にレンダー時の初期化を複数回評価することがあります。重要なのは、コミットされた 1 回のプロバイダーマウントが 1 つのクライアントを保持して公開することです。

アプリケーションが意図的に新しいクライアントを必要とする場合は、プロバイダーを再マウントします。

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## 最も近いクライアントを読む

`useClient()` は React コンポーネントまたはカスタム Hook 内で呼びます。

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

プロバイダーの外では例外を送出します。入れ子のプロバイダーには通常の React Context の規則が適用され、子孫は最も近いプロバイダーのクライアントを受け取ります。

`ClientProvider` は任意の Core `ClientOption` を受け取ります。

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## インターセプターファクトリー

アダプターの `withInterceptors(...)` はファクトリーを受け取ります。プロバイダーがクライアントを作るときにファクトリーを評価し、オプション順で結果を追加します。

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

Core の `withInterceptors(...)` はインターセプター値を受け取ります。サーバー認証情報ファクトリーは、その認証情報を所有するリクエスト境界内に置いてください。

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

パッケージは、アプリケーションの React Server Component 用クライアント境界を自動では作りません。`ClientProvider` は、先頭に `'use client'` を置いたアプリケーション側のモジュールからレンダーしてください。

アプリケーション側に Client Component を用意します。

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

リクエストヘッダー、Cookie、テナント状態、ユーザー認証情報を扱うサーバーコードは、各サーバーリクエスト境界内で Core クライアントを作成してください。それらの値をモジュールレベルのプロバイダーオプションや、リクエスト間で共有するシングルトンに取り込まないでください。アダプターは並行 SSR の分離を提供しません。

React Server Components、Next.js、hydration、Strict Mode、並行 SSR には、それぞれ固有のライフサイクル境界があります。リクエストスコープの認証情報と provider の再マウントを含め、実際のアプリケーション構成でテストしてください。

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

このコード片では、`recordRealtimeFailure` をアプリケーションのテレメトリー関数としています。`session.receive` を意図的に消費しています。上限のない受信キューを未読のまま残すのは、正しい所有方法ではありません。SSE ハンドルにも同じ起動・クリーンアップ規則を適用してください。

プロバイダーのアンマウントや再マウントはクライアントスコープを変えます。ただし、`dispose`、リクエストの中断、ハンドルやセッションのクローズは行いません。Core `Client` にそのライフサイクル API がないためです。

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

## 次に読む

- [Client](/ja-JP/core/client) — Core オプション合成とスコープ
- [Errors](/ja-JP/core/errors) — タプルを例外へ変換する統合境界
- [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) — リアルタイムリソースの所有権
