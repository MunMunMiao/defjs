---
title: React
description: React 통합 — ClientProvider, useClient, option helpers로 타입이 지정된 @defjs/core client를 React 애플리케이션에서 공유합니다.
---

# @defjs/react

`@defjs/react`는 `@defjs/core`를 React에 통합합니다. `Client`를 한 번 만들고 React Context를 통해 컴포넌트 트리에 제공하며, 자식 컴포넌트는 `useClient()`로 읽습니다.

React 애플리케이션에서 HTTP, SSE, WebSocket commands를 위한 타입이 지정된 client 하나를 공유해야 할 때 사용합니다.

## 설치

::: code-group

```bash [npm]
npm install @defjs/react @defjs/core react
```

```bash [pnpm]
pnpm add @defjs/react @defjs/core react
```

```bash [bun]
bun add @defjs/react @defjs/core react
```

:::

`react`는 peer dependency입니다. `@defjs/react`는 React 18 이상을 지원합니다.

## Client 제공

client가 필요한 컴포넌트 트리 영역을 `ClientProvider`로 감쌉니다.

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <Router />
    </ClientProvider>
  )
}
```

`ClientProvider`는 전달된 options로 `@defjs/core` client를 만들고 private React Context에 저장합니다.

## Client 사용

자식 컴포넌트에서 `useClient()`를 호출해 가장 가까운 provider가 제공하는 client를 가져옵니다.

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

export function UserProfile() {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      if (!error) {
        setName(user.name)
      }
    })
  }, [client])

  return <div>{name}</div>
}
```

`ClientProvider` 밖에서 `useClient()`를 호출하면 누락된 provider 문제를 즉시 확인할 수 있도록 런타임 오류를 던집니다.

## Option Helpers

`withEndpoint`와 `withInterceptors`는 `@defjs/core` client options를 만드는 React 패키지 helpers입니다.

```tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((request, next) => {
  request.headers.set('Authorization', 'Bearer token')
  return next(request)
})

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(() => authInterceptor)]}>
      <Router />
    </ClientProvider>
  )
}
```

`withInterceptors`는 팩토리 함수를 받습니다. 각 팩토리는 interceptor를 반환하고, 생성된 interceptors는 만들어진 client에 등록됩니다.

## Client Components

React wrapper에는 `"use client"`가 표시되어 있습니다. React Server Component 애플리케이션에서는 client component 경계에서 `ClientProvider`를 렌더링하세요.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API Reference

### `<ClientProvider options?: ClientOption[]>`

client를 만들고 자식 컴포넌트에 제공합니다. Options는 provider가 client를 만들 때 평가됩니다.

### `useClient(): Client`

가장 가까운 `ClientProvider`의 client를 반환합니다. provider를 찾지 못하면 오류를 던집니다.

### `withEndpoint(endpoint: string): ClientOption`

client의 base endpoint URL을 설정합니다.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

팩토리 함수를 통해 interceptors를 등록합니다.

## 참고 사항

- React 18 이상이 필요합니다.
- `ClientProvider`는 client component 코드에 있어야 합니다.
- `useClient()`는 `ClientProvider` 아래에서 실행되어야 합니다.
- `@defjs/react`는 `@defjs/core`의 request, command, interceptor, error model을 변경하지 않습니다.

## 다음 단계

- [Client →](/core/client) — Client 생성과 설정
- [Interceptors →](/core/interceptors) — 어니언 모델 interceptor 체인
- [Commands →](/core/commands) — HTTP, SSE, WebSocket command 정의
