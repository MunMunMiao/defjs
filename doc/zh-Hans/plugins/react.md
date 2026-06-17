---
title: React
description: React 集成 — 使用 ClientProvider、useClient 和 option helpers 在 React 应用中共享类型化 @defjs/core client。
---

# @defjs/react

`@defjs/react` 将 `@defjs/core` 接入 React。它创建一次 `Client`，通过 React Context 暴露给组件树，并让子组件使用 `useClient()` 读取。

当 React 应用需要共享一个用于 HTTP、SSE 或 WebSocket 命令的类型化 client 时使用它。

## 安装

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

`react` 是 peer dependency。`@defjs/react` 支持 React 18 及更高版本。

## 提供 Client

用 `ClientProvider` 包裹需要访问 client 的组件树。

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

`ClientProvider` 根据传入的 options 创建 `@defjs/core` client，并将它保存在私有 React Context 中。

## 使用 Client

在子组件中调用 `useClient()`，读取最近的 provider 提供的 client。

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

如果在 `ClientProvider` 外调用 `useClient()`，它会抛出运行时错误，让缺失 provider 的问题立即暴露。

## Option Helpers

`withEndpoint` 和 `withInterceptors` 是 React 包提供的 helpers，用来生成 `@defjs/core` client options。

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

`withInterceptors` 接收工厂函数。每个工厂函数返回一个 interceptor，生成的 interceptors 会注册到创建出来的 client 上。

## Client Components

React wrapper 标记了 `"use client"`。在 React Server Component 应用中，请从 client component 边界渲染 `ClientProvider`。

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API 参考

### `<ClientProvider options?: ClientOption[]>`

创建 client，并提供给子组件。Options 会在 provider 创建 client 时求值。

### `useClient(): Client`

返回最近的 `ClientProvider` 中的 client。找不到 provider 时会抛错。

### `withEndpoint(endpoint: string): ClientOption`

设置 client 的 base endpoint URL。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

通过工厂函数注册 interceptors。

## 注意事项

- 需要 React 18 或更高版本。
- `ClientProvider` 应放在 client component 代码中。
- `useClient()` 必须在 `ClientProvider` 下方调用。
- `@defjs/react` 不改变 `@defjs/core` 的请求、命令、拦截器或错误模型。

## 下一步

- [客户端 →](/core/client) — Client 创建与配置
- [拦截器 →](/core/interceptors) — 洋葱模型拦截器链
- [命令 →](/core/commands) — HTTP、SSE 和 WebSocket 命令定义
