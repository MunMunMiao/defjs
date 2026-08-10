---
title: React
description: React Context에서 Defjs 클라이언트를 공유하고 API에 맞게 설정하며 effect에서 요청과 실시간 리소스를 정리합니다.
---

# `@defjs/react`

`@defjs/react`는 `@defjs/core`를 위한 가벼운 context adapter입니다. 다음 항목을 export합니다.

- core 클라이언트를 만들고 제공하는 `ClientProvider`
- 가장 가까이 제공된 클라이언트를 반환하는 `useClient()`
- adapter의 `withEndpoint(...)` 및 interceptor factory용 `withInterceptors(...)` helper

caching, Suspense 통합, query retry, 서버 데이터 직렬화를 추가하지 않습니다. `@defjs/core`, React와 함께 설치하고 이런 애플리케이션 책임은 자체 코드에서 관리하세요.

## Client 제공

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

commit된 provider mount 하나는 클라이언트 하나를 유지합니다. 일반적인 rerender에서는 변경된 `options` 배열을 다시 적용하거나 클라이언트를 교체하지 않습니다.

구현은 lazy `useState` initializer를 사용합니다. 개발 환경에서 이 initializer가 정확히 한 번만 실행된다고 기대하지 마세요. React Strict Mode는 commit 전에 render-time initialization을 여러 번 평가할 수 있습니다. 중요한 생명주기 보장은 commit된 provider mount 하나가 유지된 클라이언트 하나를 노출한다는 점입니다.

애플리케이션에서 의도적으로 새 클라이언트가 필요할 때 provider를 remount하세요.

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## 가장 가까운 클라이언트 읽기

React component 또는 사용자 정의 Hook 안에서 `useClient()`를 호출하세요.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

provider 밖에서 호출하면 throw합니다. 중첩 provider는 일반 React Context 동작을 따르며 descendant는 가장 가까운 provider의 클라이언트를 받습니다.

`ClientProvider`는 모든 core `ClientOption`을 받습니다.

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## Interceptor factory

adapter의 `withInterceptors(...)`는 factory를 받습니다. provider가 클라이언트를 만들 때 factory를 평가하고 결과를 옵션 순서대로 추가합니다.

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

core `withInterceptors(...)`는 대신 인터셉터 값을 받습니다. 서버 credential factory는 해당 credential을 소유하는 요청 경계 안에 두세요.

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

패키지는 애플리케이션의 React Server Component 클라이언트 경계를 자동으로 만들지 않습니다. `ClientProvider`는 `'use client'`로 시작하는 애플리케이션 소유 모듈 뒤에 두세요.

애플리케이션이 소유하는 Client Component를 만드세요.

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

요청 header, cookie, tenant state 또는 사용자 credential을 다루는 서버 코드는 서버 요청 경계마다 core client를 만들어야 합니다. 이런 값을 module-level provider 옵션이나 여러 요청이 공유하는 singleton에 capture하지 마세요. adapter는 동시 SSR 격리를 제공하지 않습니다.

React Server Component, Next.js, hydration, Strict Mode, 동시 SSR에는 각자 framework 생명주기 경계가 있습니다. 요청 범위 credential과 provider remount를 포함해 실제 애플리케이션 설정에서 테스트하세요.

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

## 다음 단계

- [클라이언트](/ko-KR/core/client)에서는 core 옵션 조합과 범위를 설명합니다.
- [오류](/ko-KR/core/errors)에서는 튜플을 예외로 바꾸는 통합 경계를 설명합니다.
- [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)에서는 realtime 소유권을 설명합니다.
