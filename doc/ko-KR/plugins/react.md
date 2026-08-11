---
title: React
description: React Context에서 Defjs 클라이언트를 공유하고 API에 맞게 설정하며 effect에서 요청과 실시간 리소스를 정리합니다.
---

# `@defjs/react`

이 패키지는 `@defjs/core`용 얇은 Context adapter입니다. `ClientProvider`는 애플리케이션이 만든 client를 제공하고 `useClient()`는 가장 가까운 instance를 반환합니다. client factory, cache, retry, resource lifecycle은 추가하지 않습니다.

## Client 제공

`@defjs/core`에서 client를 생성하고 구성한 뒤 그 instance를 명시적으로 전달합니다.

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

`ClientProvider`는 전달받은 것과 동일한 instance를 노출합니다. 생성과 교체 시점, request 및 realtime resource 수명은 호출자가 소유합니다.

## 가장 가까운 클라이언트 읽기

`useClient()`는 React component 또는 custom Hook 안에서 호출합니다. provider 밖에서는 오류를 던지며 중첩 provider는 일반 React Context의 가장 가까운 provider 규칙을 따릅니다.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

모든 구성 option은 `@defjs/core`에서 가져옵니다.

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## Interceptor factory

interceptor value를 만들고 core의 `withInterceptors(...)`로 조합한 뒤 client를 React에 전달합니다.

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

factory가 request별 credential을 캡처한다면 해당 client를 만드는 request boundary 안에서 호출하세요.

## HTTP 이펙트 생명주기 관리

effect 안에서 취소를 만들고 cleanup 이후 완료 결과를 무시하세요.

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

Defjs는 예상 가능한 요청 실패를 튜플로 반환합니다. query library의 `queryFn`처럼 예외를 기대하는 통합 경계에서만 오류를 throw 값으로 바꾸세요.

## Client Component 경계

패키지 entry는 Client Component boundary입니다. 애플리케이션 소유 wrapper에서 browser client를 만들고 명시적으로 제공할 수 있습니다.

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

header, cookie, tenant state 또는 credential을 다루는 server code는 request boundary마다 별도 client를 만들어야 합니다. adapter는 동시 SSR을 격리하거나 client 작업을 정리하지 않습니다.

## 실시간 이펙트 생명주기 관리

provider unmount는 descendant가 시작한 리소스를 닫지 않습니다. WebSocket을 여는 effect는 시작을 abort하고, 늦게 도착한 session을 닫고, incoming queue를 소비하고, observer를 구독 해제하고, 활성 session을 닫아야 합니다.

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

이 fragment는 `recordRealtimeFailure`가 애플리케이션 telemetry 함수라고 가정합니다. 의도적으로 `session.receive`를 소비합니다. 유한 incoming queue를 읽지 않으면 overflow가 세션을 fatal 종료합니다. SSE handle에도 같은 시작 및 cleanup 규칙을 적용하세요.

provider unmount/remount는 클라이언트 범위를 바꿉니다. core `Client`에는 그런 생명주기 API가 없으므로 `dispose`를 호출하거나 요청을 abort하거나 handle과 session을 닫지는 않습니다.

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

전달된 client를 하위 component에 제공합니다. `children`은 선택 사항입니다.

가장 가까운 client를 반환하며 없으면 오류를 던집니다.

## 다음 단계

- [클라이언트](/ko-KR/core/client)에서는 core 옵션 조합과 범위를 설명합니다.
- [오류](/ko-KR/core/errors)에서는 튜플을 예외로 바꾸는 통합 경계를 설명합니다.
- [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)에서는 realtime 소유권을 설명합니다.
