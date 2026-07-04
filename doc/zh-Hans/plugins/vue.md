---
title: Vue
description: "@defjs/core 的轻量 Vue 适配器，提供 provideClient 与 injectClient 接线，以及面向主流应用层集成的实践示例。"
---

# @defjs/vue

`@defjs/vue` 是 `@defjs/core` 之上的轻量适配层。它通过 `provideClient(...)` 提供应用级的 client 注入，并通过 `injectClient()` 让 Vue 组件和组合式函数共享同一个类型化 defjs client。

它不实现 Nuxt module、Pinia plugin、query cache、重试策略或应用状态管理。这些模式应放在应用层，通过你自己的 composables、stores、route handlers 或 framework plugins 去调用 `client.execute(...)`。

## 仓库工作区使用说明

当前页面记录的是本仓库内的源码/工作区用法。`@defjs/vue` 位于 `packages/vue`，它的 peer dependency 期望使用 `packages/core` 中与之匹配的 `@defjs/core` 工作区版本。

下面示例里的 import specifier 使用包名，但在这个仓库里它们解析到的是工作区源码包，而不是 npm registry 上已发布的一对兼容包。公开 npm 当前并不提供 `@defjs/vue`，而且那里最新单独发布的 `@defjs/core` 版本也与这里展示的 API 不匹配。如果未来发布了兼容的 `@defjs/vue` 与 `@defjs/core` 版本，请在对应环境中成对安装那些已发布版本，不要把这个包和较旧的独立 `@defjs/core` 发布版混用。

当前工作区/打包基线：本仓库使用 Node `>=26`、`pnpm@11.6.0` 和 `engine-strict=true`，并且 `packages/vue/package.json` 当前声明了 `engines.node >=26`。这意味着这个源码工作区，以及基于当前 manifests 构建出来的任何包，目前都以 Node >=26 为下限。如果你未来安装某个已发布版本，请以那个发布版本随附的 `engines` 字段和 release notes 为准。

Vue 本身仍然是 peer dependency。`@defjs/vue` 支持 Vue 3 及以上版本。

## 适配器负责什么

当你希望由 Vue 负责 client 注入时，使用 `@defjs/vue`：

- `provideClient(...)` 会在插件安装期间构建一个 `@defjs/core` client。
- `injectClient()` 在组件 setup 或组合式函数中读取该 client。
- `withEndpoint` 和 `withInterceptors` 是用于插件安装的 Vue 专用 client 配置辅助函数。

如果你需要在 Vue 应用安装流程之外创建 client，请直接使用 `@defjs/core` 的 `createClient(...)`。那才是 SSR 请求 helper、route handler 和非 Vue 集成代码的正确位置。

## 快速开始

### 1. 在共享模块中定义请求

```ts
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
    {
      status: 404,
      body: struct.object({
        message: struct.string(),
      }),
    },
  ] as const,
})
```

### 2. 在应用入口提供一个 client

```ts
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

### 3. 在 setup 代码中注入 client

```vue
<!-- UserCard.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { injectClient } from '@defjs/vue'
import { getUser } from './api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('loading...')

onMounted(async () => {
  const [error, user] = await client.execute(getUser({ path: { id: props.id } }))

  if (error) {
    name.value = error.message
    return
  }

  name.value = user.name
})
</script>

<template>
  <div>{{ name }}</div>
</template>
```

如果在 `app.use(provideClient(...))` 之前调用 `injectClient()`，它会立即抛错，让缺少 provider 的问题在开发期就暴露出来。

## 配置辅助函数

`@defjs/vue` 里的 `withEndpoint` 和 `withInterceptors` 是面向插件的配置辅助函数。`withInterceptors` 接收工厂函数，因为真正的 `@defjs/core` client 会在 Vue 插件安装期间稍后创建。在这个适配器里，`withInterceptors(...)` 会用这些工厂函数产出的 interceptors 替换 `config.interceptors`，所以同一个 client 需要的所有 interceptors 应放进同一次 `withInterceptors(...)` 调用里。

```ts
import { createApp } from 'vue'
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import App from './App.vue'

const authInterceptor = createHttpInterceptor(async (request, next) => {
  const headers = request.headers ?? new Headers()
  request.headers = headers
  headers.set('authorization', 'Bearer token')
  return next(request)
})

const app = createApp(App)

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)

app.mount('#app')
```

如果你是在 Vue 应用安装流程之外构建 client，请直接使用 `@defjs/core`：

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

### Nuxt client plugin：显式提供浏览器侧 client

在 Nuxt 的浏览器端应用使用场景里，从 Nuxt plugin 安装 Vue 适配器，并在该处创建浏览器侧 client：

```ts
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

### Nuxt 服务端路由与 SSR：让敏感转发保持请求作用域

当你需要在 SSR 或服务端路由里转发请求相关的 headers 或 cookies 时，应在该请求边界内使用 `@defjs/core` 创建 request-scoped client。不要把带有敏感请求头的 client 存成跨请求单例。

```ts
// server/lib/create-server-client.ts
import { getCookie, getHeader, getRequestHeaders } from 'h3'
import {
  createClient,
  createHttpInterceptor,
  withEndpoint,
  withInterceptors,
} from '@defjs/core'

export function createServerClient(event: Parameters<typeof getRequestHeaders>[0]) {
  const requestId = getHeader(event, 'x-request-id')
  const reviewedCookieNames = ['session', 'csrf-token'] as const
  const serializeForwardedCookie = (
    name: (typeof reviewedCookieNames)[number],
    value: string,
  ) => `${name}=${encodeURIComponent(value)}`
  const reviewedCookieHeader = reviewedCookieNames
    .flatMap((name) => {
      const value = getCookie(event, name)
      return value ? [serializeForwardedCookie(name, value)] : []
    })
    .join('; ')

  return createClient(
    withEndpoint(useRuntimeConfig(event).apiBase),
    withInterceptors(
      createHttpInterceptor(async (request, next) => {
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

只转发你的应用已经审查过的 headers 和 cookies。转发 cookies 时，应由应用自己维护一个显式 allowlist，并基于序列化后的值拼接 header，而不是直接透传原始传入 `cookie` header。Vue 适配器本身不会替你决定哪些内容可以安全转发。

### Pinia actions：让状态所有权留在 Pinia

Pinia 可以负责 loading state、重试和 store 生命周期。Defjs 仍然只是类型化传输层。

```ts
// stores/user.ts
import { defineStore } from 'pinia'
import { injectClient } from '@defjs/vue'
import { getUser } from '../api'

export const useUserStore = defineStore('user', () => {
  const client = injectClient()

  async function loadUser(id: number) {
    const [error, user] = await client.execute(getUser({ path: { id } }))
    if (error) {
      throw error
    }
    return user
  }

  return { loadUser }
})
```

这里显式的 `throw error` 就是当 store 选择异常控制流时的集成边界。

### SSE 与 WebSocket 返回形状：在 setup 管理的异步流程中读取字段

当你在 Vue 组件或 composable 中读取 SSE / WebSocket 结果时，把异步逻辑放进 `onMounted(async () => { ... })` 或其他显式 `async` 函数中。下面示例展示当前 core 返回形状，并避免在普通 `ts` 代码块里依赖 top-level `await`。

SSE 命令返回 `[error, stream, open]`。流里的每一项都是一个事件对象，顶层包含 `event`、`data`，以及可选的 `id`、`retry` 字段；下面循环里的变量名叫 `event`，所以业务数据读取为 `event.data`。

```ts
// use-notifications.ts
import { onBeforeUnmount, onMounted } from 'vue'
import { defineEventStream, struct } from '@defjs/core'
import { injectClient } from '@defjs/vue'

const notifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
  },
})

export function useNotifications() {
  const client = injectClient()
  let disposed = false
  let closeStream = () => {}

  onBeforeUnmount(() => {
    disposed = true
    closeStream()
  })

  onMounted(async () => {
    const [streamError, stream] = await client.execute(notifications())

    if (streamError || !stream) {
      return
    }

    if (disposed) {
      stream.close('component-unmounted')
      return
    }

    closeStream = () => {
      stream.close('component-unmounted')
    }

    try {
      for await (const event of stream) {
        if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
          console.log(event.data.text)
        }
      }
    } catch (error) {
      const closeInfo = await stream.closed

      if (disposed || closeInfo.code === 'aborted') {
        return
      }

      console.error('notification stream failed', error)
    }
  })
}
```

WebSocket 命令返回 `[error, session, connection]`。收到的消息会把 `type` 放在顶层，字段也直接展开在顶层对象上，而不是嵌套在 `message` 属性里。

```ts
// use-chat-session.ts
import { onBeforeUnmount, onMounted } from 'vue'
import { defineWebSocket, struct } from '@defjs/core'
import { injectClient } from '@defjs/vue'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})

export function useChatSession() {
  const client = injectClient()
  let disposed = false
  let closeSession = () => {}
  let unsubscribeRuntimeError = () => {}

  onBeforeUnmount(() => {
    disposed = true
    unsubscribeRuntimeError()
    closeSession()
  })

  onMounted(async () => {
    const [socketError, session] = await client.execute(chat())

    if (socketError || !session) {
      return
    }

    if (disposed) {
      session.close(1000, 'component-unmounted')
      return
    }

    unsubscribeRuntimeError = session.onRuntimeError((error) => {
      if (!disposed) {
        console.error('chat session runtime error', error)
      }
    })

    closeSession = () => {
      unsubscribeRuntimeError()
      session.close(1000, 'component-unmounted')
    }

    session.send({ type: 'send', text: 'Hello' })

    try {
      for await (const msg of session.receive) {
        if (msg.type === 'message') {
          console.log(msg.user, msg.text)
        }
      }
    } finally {
      unsubscribeRuntimeError()
      const closeInfo = await session.closed

      if (!disposed && closeInfo.code !== 1000) {
        console.warn('chat session closed', closeInfo)
      }
    }
  })
}
```

### WebSocket 清理：当所有者消失时关闭资源

把 WebSocket session 视作由组件、路由或 store 持有的资源。应在异步建连前后注册清理逻辑；如果组件在握手期间先卸载，等 session 稍后到达时也要立刻关闭，避免长连接活得比需要它的 UI 更久。

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { injectClient } from '@defjs/vue'
import { openChat } from './chat-api'

const client = injectClient()
let disposed = false
let closeSession = () => {}
let unsubscribeRuntimeError = () => {}

onBeforeUnmount(() => {
  disposed = true
  unsubscribeRuntimeError()
  closeSession()
})

onMounted(async () => {
  const [error, session] = await client.execute(openChat({ path: { roomId: 'lobby' } }))

  if (error || !session) {
    return
  }

  if (disposed) {
    session.close(1000, 'component-unmounted')
    return
  }

  unsubscribeRuntimeError = session.onRuntimeError((runtimeError) => {
    if (!disposed) {
      console.error('chat runtime error', runtimeError)
    }
  })

  closeSession = () => {
    unsubscribeRuntimeError()
    session.close(1000, 'component-unmounted')
  }

  void session.closed.then((closeInfo) => {
    unsubscribeRuntimeError()

    if (!disposed && closeInfo.code !== 1000) {
      console.warn('chat closed unexpectedly', closeInfo)
    }
  })
})
</script>
```

对于 SSE handle，可调用 `stream.close(reason)`，并在 UI 需要最终关闭结果时等待 `stream.closed`。

### SSR 安全性：避免把用户相关状态放进跨请求 client 单例

如果浏览器端单例 client 只携带公开 endpoint 这类浏览器安全配置，那么它通常是可以接受的。但服务端单例如果捕获了每个请求不同的认证头、cookies 或租户上下文，就不适合 SSR。应在请求边界内创建这些 client，并且只传入当前请求被允许使用的数据。

## API 参考

### `provideClient(...feature: ClientOption[]): Plugin`

创建一个 Vue 插件。安装时，它会构建一个 client，并将其提供给应用上下文。

### `injectClient(): Client`

返回由 `provideClient(...)` 提供的 client。如果没有提供 client，则抛错。

### `withEndpoint(endpoint: string): ClientOption`

为 `provideClient(...)` 创建的 client 设置基础 endpoint URL。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

为 `provideClient(...)` 创建的 client 注册 interceptor 工厂函数。在这个适配器里，`withInterceptors(...)` 会用这些工厂函数产出的 interceptors 替换 `config.interceptors`，所以同一个 client 需要的所有 interceptors 应放进同一次 `withInterceptors(...)` 调用里。

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`，供适配器内部的 `provide` / `inject` 接线使用。

## 注意事项

- 这个适配器不会改变 `@defjs/core` 的请求、命令、拦截器或错误模型。
- `provideClient(...)` 会在插件安装时创建 client，而不是在每次组件渲染时创建。
- 传输细节见 [Client →](/zh-Hans/core/client)、[SSE →](/zh-Hans/core/sse) 和 [WebSocket →](/zh-Hans/core/web-socket)。

## 下一步

- [Client →](/zh-Hans/core/client) — Client 创建与执行模型
- [Commands →](/zh-Hans/core/commands) — HTTP、SSE 与 WebSocket 命令定义
- [Interceptors →](/zh-Hans/core/interceptors) — Core 拦截器注册与传输链
