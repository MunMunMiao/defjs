---
title: React
description: React 整合 — 使用 ClientProvider、useClient 與 option helpers 在 React 應用程式中共享型別化 @defjs/core client。
---

# @defjs/react

`@defjs/react` 將 `@defjs/core` 接入 React。它只建立一次 `Client`，透過 React Context 暴露給元件樹，並讓子元件使用 `useClient()` 讀取。

當 React 應用程式需要共享一個用於 HTTP、SSE 或 WebSocket 指令的型別化 client 時使用它。

## 安裝

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

`react` 是 peer dependency。`@defjs/react` 支援 React 18 及更新版本。

## 提供 Client

用 `ClientProvider` 包裹需要存取 client 的元件樹。

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

`ClientProvider` 依照傳入的 options 建立 `@defjs/core` client，並將它保存在私有 React Context 中。

## 使用 Client

在子元件中呼叫 `useClient()`，讀取最近的 provider 所提供的 client。

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

如果在 `ClientProvider` 外呼叫 `useClient()`，它會拋出執行階段錯誤，讓缺少 provider 的問題立即浮現。

## Option Helpers

`withEndpoint` 與 `withInterceptors` 是 React 套件提供的 helpers，用來產生 `@defjs/core` client options。

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

`withInterceptors` 接收工廠函式。每個工廠函式回傳一個 interceptor，產生的 interceptors 會註冊到建立出的 client 上。

## Client Components

React wrapper 標記了 `"use client"`。在 React Server Component 應用程式中，請從 client component 邊界渲染 `ClientProvider`。

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API 參考

### `<ClientProvider options?: ClientOption[]>`

建立 client，並提供給子元件。Options 會在 provider 建立 client 時求值。

### `useClient(): Client`

回傳最近的 `ClientProvider` 中的 client。找不到 provider 時會拋錯。

### `withEndpoint(endpoint: string): ClientOption`

設定 client 的 base endpoint URL。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

透過工廠函式註冊 interceptors。

## 注意事項

- 需要 React 18 或更新版本。
- `ClientProvider` 應放在 client component 程式碼中。
- `useClient()` 必須在 `ClientProvider` 下方呼叫。
- `@defjs/react` 不改變 `@defjs/core` 的請求、指令、攔截器或錯誤模型。

## 接下來

- [用戶端 →](/core/client) — Client 建立與設定
- [攔截器 →](/core/interceptors) — 洋蔥模型攔截器鏈
- [指令 →](/core/commands) — HTTP、SSE 與 WebSocket 指令定義
