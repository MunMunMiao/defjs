---
title: React
description: "@defjs/core 的轻量 React 适配器，提供 ClientProvider、useClient，以及面向主流应用层集成的实践示例。"
---

# @defjs/react

`@defjs/react` 是 `@defjs/core` 之上的轻量适配层。它在 React 边界通过 `ClientProvider` 创建类型化 client，通过 React Context 暴露该 client，并让子组件通过 `useClient()` 读取。

它不实现 query cache、重试、Suspense 或应用状态管理。这些模式应放在应用层，通过你自己的 hooks、loaders 或第三方库去调用 `client.execute(...)`。

## 仓库工作区使用说明

当前页面记录的是本仓库内的源码/工作区用法。`@defjs/react` 位于 `packages/react`，它的 peer dependency 期望使用 `packages/core` 中与之匹配的 `@defjs/core` 工作区版本。

下面示例里的 import specifier 使用包名，但在这个仓库里它们解析到的是工作区源码包，而不是 npm registry 上已发布的一对兼容包。公开 npm 当前并不提供 `@defjs/react`，而且那里最新单独发布的 `@defjs/core` 版本也与这里展示的 API 不匹配。如果未来发布了兼容的 `@defjs/react` 与 `@defjs/core` 版本，请在对应环境中成对安装那些已发布版本，不要把这个包和较旧的独立 `@defjs/core` 发布版混用。

当前工作区/打包基线：本仓库使用 Node `>=26`、`pnpm@11.6.0` 和 `engine-strict=true`，并且 `packages/react/package.json` 当前声明了 `engines.node >=26`。这意味着这个源码工作区，以及基于当前 manifests 构建出来的任何包，目前都以 Node >=26 为下限。如果你未来安装某个已发布版本，请以那个发布版本随附的 `engines` 字段和 release notes 为准。

React 本身仍然是 peer dependency。`@defjs/react` 支持 React 18 及以上版本。

## 适配器负责什么

当你希望由 React 负责 client 注入时，使用 `@defjs/react`：

- `ClientProvider` 会在每次 provider 挂载时创建一个 `@defjs/core` client。
- `useClient()` 读取最近一层 provider 提供的 client。
- `withEndpoint` 和 `withInterceptors` 是用于 provider 配置的 React 专用 client 配置辅助函数。

如果你需要在 React 组件树之外创建 client，请直接使用 `@defjs/core` 的 `createClient(...)`。那才是请求作用域服务端 helper、测试夹具和非 React 集成代码的正确位置。

## 快速开始

### 1. 在共享模块中定义请求

```tsx
// api.ts
import { defineRequest, struct } from '@defjs/core'

export const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
  ] as const,
})
```

### 2. 在 React 边界提供一个 client

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserProfile } from './UserProfile'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile id={1} />
    </ClientProvider>
  )
}
```

`ClientProvider` 会在每次挂载时创建一次 client，并为子组件保持稳定引用。

### 3. 在组件中读取 client

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('loading...')

  useEffect(() => {
    let cancelled = false

    client.execute(getUser({ path: { id } })).then(([error, user]) => {
      if (cancelled) {
        return
      }

      if (error) {
        setName(error.message)
        return
      }

      setName(user.name)
    })

    return () => {
      cancelled = true
    }
  }, [client, id])

  return <div>{name}</div>
}
```

如果在 `ClientProvider` 外调用 `useClient()`，它会立即抛错，让缺少 provider 的问题在开发期就暴露出来。

## 配置辅助函数

`@defjs/react` 里的 `withEndpoint` 和 `withInterceptors` 是面向 provider 的配置辅助函数。`withInterceptors` 接收工厂函数，因为真正的 `@defjs/core` client 会在 `ClientProvider` 内部稍后创建。在这个适配器里，`withInterceptors(...)` 会用这些工厂函数产出的 interceptors 替换 `config.interceptors`，所以同一个 provider 需要的所有 interceptors 应放进同一次 `withInterceptors(...)` 调用里。

```tsx
import type { ReactNode } from 'react'
import { createHttpInterceptor } from '@defjs/core'
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'

const authInterceptor = createHttpInterceptor(async (request, next) => {
  const headers = request.headers ?? new Headers()
  request.headers = headers
  headers.set('authorization', 'Bearer token')
  return next(request)
})

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClientProvider
      options={[
        withEndpoint('https://api.example.com'),
        withInterceptors(() => authInterceptor),
      ]}
    >
      {children}
    </ClientProvider>
  )
}
```

如果你是在 React 之外构建 client，请直接使用 `@defjs/core`：

```ts
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (request, next) => {
      const headers = request.headers ?? new Headers()
      request.headers = headers
      headers.set('authorization', 'Bearer token')
      return next(request)
    }),
  ),
)
```

## 实践示例

### Next.js App Router：让服务端 client 保持请求作用域

`@defjs/react` 只负责 React 组件内部的 client 注入。在 Next.js App Router 中，应在请求边界内用 `@defjs/core` 创建服务端 defjs client，而浏览器侧的 client 共享则放在渲染 `ClientProvider` 的 client component 中。

```ts
// app/lib/createServerClient.ts
import { cookies, headers } from 'next/headers'
import {
  createClient,
  createHttpInterceptor,
  withEndpoint,
  withInterceptors,
} from '@defjs/core'

export async function createServerClient() {
  const requestHeaders = await headers()
  const requestCookies = await cookies()
  const reviewedCookieNames = ['session', 'csrf-token'] as const
  const serializeForwardedCookie = (
    name: (typeof reviewedCookieNames)[number],
    value: string,
  ) => `${name}=${encodeURIComponent(value)}`

  return createClient(
    withEndpoint(process.env.API_ENDPOINT!),
    withInterceptors(
      createHttpInterceptor(async (request, next) => {
        const requestId = requestHeaders.get('x-request-id')
        const reviewedCookieHeader = reviewedCookieNames
          .flatMap((name) => {
            const cookie = requestCookies.get(name)
            return cookie ? [serializeForwardedCookie(name, cookie.value)] : []
          })
          .join('; ')

        if (requestId || reviewedCookieHeader) {
          const forwardedHeaders = request.headers ?? new Headers()
          request.headers = forwardedHeaders

          if (requestId) {
            forwardedHeaders.set('x-request-id', requestId)
          }

          if (reviewedCookieHeader) {
            forwardedHeaders.set('cookie', reviewedCookieHeader)
          }
        }

        return next(request)
      }),
    ),
  )
}
```

```tsx
// app/api-provider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return (
    <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>
      {children}
    </ClientProvider>
  )
}
```

只转发你的应用已经审查过的 headers 和 cookies。转发 cookies 时，应由应用自己维护一个显式 allowlist，并基于序列化后的值拼接 header，而不是把整个传入 cookie jar 原样透传。`@defjs/react` 不会自动替你读取 `headers()` 或 `cookies()`。

### TanStack Query：让 Query 接管缓存和重试

把 defjs 当作类型化传输层。TanStack Query 负责 cache entry、重试、后台 refetch 和 loading state。

```tsx
import { useQuery } from '@tanstack/react-query'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function useUserQuery(id: number) {
  const client = useClient()

  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const [error, user] = await client.execute(getUser({ path: { id } }))
      if (error) {
        throw error
      }
      return user
    },
  })
}
```

这里显式的 `throw error` 就是集成边界。Defjs 自身仍然返回 error-first tuple。

### Prefetch、dehydrate 与 hydrate：把缓存数据留在 TanStack Query 中

在 prefetch 流程里，应由你的应用代码创建并持有 `QueryClient`，然后在 query 的 prefetch 函数里调用一个 fetch helper，再由该 helper 使用 `client.execute(...)` 把结果交给 TanStack Query：

```ts
import { type Client } from '@defjs/core'
import { type QueryClient } from '@tanstack/react-query'
import { getUser } from './api'

type GetUserData = {
  id: number
  name: string
}

type FetchUser = (id: number) => Promise<GetUserData>

export async function prefetchUser(
  queryClient: QueryClient,
  fetchUser: FetchUser,
  id: number,
) {
  await queryClient.prefetchQuery({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
  })
}

export async function fetchUserWithClient(
  client: Client,
  id: number,
): Promise<GetUserData> {
  const [error, user] = await client.execute(getUser({ path: { id } }))
  if (error) {
    throw error
  }
  if (!user) {
    throw new Error('Expected getUser to return a user payload')
  }
  return user
}
```

让 TanStack Query 自己负责 `dehydrate(...)` 和 `HydrationBoundary`。序列化后的 query 数据应放进 TanStack Query 的 hydration payload，而不是尝试把缓存数据塞进 defjs client。

### Error Boundaries：tuple 失败不会自动抛出

普通请求失败时，`client.execute(...)` 不会抛异常。它返回的是 `[error, undefined, response?]`。React Error Boundary 只能看到被抛出的错误，所以当你需要 boundary 行为时，应在集成层把 tuple failure 转成 thrown error。

```tsx
export function UserScreen({ id }: { id: number }) {
  const query = useUserQuery(id)

  if (query.error) {
    throw query.error
  }

  if (!query.isSuccess) {
    return <div>Loading...</div>
  }

  return <div>{query.data.name}</div>
}
```

### ClientProvider 生命周期：需要新 client 时就 remount

`ClientProvider` 会在挂载时读取 `options`，并让创建出的 client 在该子树内保持稳定。如果 endpoint、认证上下文或 interceptor 接线发生变化，且这些变化需要生成新的 client 实例，就应该在拥有该生命周期的边界 remount provider。

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApp tenantId={tenantId} />
</ClientProvider>
```

在你希望其 interceptors 与配置生效的同一个生命周期边界创建 client。对于纯浏览器应用，这通常是顶层 provider。对于请求作用域渲染，应使用 `@defjs/core` 创建 request-specific client，避免敏感 headers 或 cookies 在不同用户之间泄漏。

## API 参考

### `<ClientProvider options?: ClientOption[]>`

创建一个 client，并将其提供给子组件。Options 会在 provider 挂载时应用。

### `useClient(): Client`

返回最近一层 `ClientProvider` 提供的 client。如果没有 provider，则抛错。

### `withEndpoint(endpoint: string): ClientOption`

为 `ClientProvider` 创建的 client 设置基础 endpoint URL。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

为 `ClientProvider` 创建的 client 注册 interceptor 工厂函数。在这个适配器里，`withInterceptors(...)` 会用这些工厂函数产出的 interceptors 替换 `config.interceptors`，所以同一个 provider 需要的所有 interceptors 应放进同一次 `withInterceptors(...)` 调用里。

## 注意事项

- `ClientProvider` 标记了 `"use client"`，所以在 React Server Component 应用中，应从 client component 边界渲染它。
- 这个适配器不会改变 `@defjs/core` 的请求、命令、拦截器或错误模型。
- HTTP 相关内容见 [Commands →](/zh-Hans/core/commands)；传输配置见 [Client →](/zh-Hans/core/client)。

## 下一步

- [Client →](/zh-Hans/core/client) — Client 创建与执行模型
- [Commands →](/zh-Hans/core/commands) — HTTP、SSE 与 WebSocket 命令定义
- [Interceptors →](/zh-Hans/core/interceptors) — Core 拦截器注册与传输链
