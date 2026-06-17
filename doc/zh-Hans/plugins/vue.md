---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` 是 `@defjs/core` 的 Vue 3 插件。它提供 `provideClient` 在应用级别注册 `Client` 实例，以及 `injectClient` 在组件或组合式函数中访问该实例。

两者共享来自 `@defjs/core` 的相同配置辅助函数 `withEndpoint` 和 `withInterceptors`。

## 安装

```bash
npm install @defjs/vue @defjs/core
# 或
pnpm add @defjs/vue @defjs/core
# 或
bun add @defjs/vue @defjs/core
```

## 快速开始

### 1. 在应用入口提供客户端

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient` 返回一个标准 Vue 插件。内部使用 `app.provide()` 将 `Client` 实例注入应用上下文。所有子组件都可以通过 `injectClient()` 访问它。

### 2. 在组件中注入和使用

```typescript
// UserCard.vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineRequest, struct } from '@defjs/core'

const client = injectClient()

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
      email: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser())
  if (error) {
    console.error('Request failed:', error.code, error.message)
    return
  }
  console.log(user.id, user.name, user.email) // 完全类型推断
}
</script>
```

## 配置拦截器

使用 `withInterceptors` 注册工厂函数数组。每个工厂在插件安装期间执行，返回的拦截器实例注册到客户端。

```typescript
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((req, next) => {
  req.headers.set('Authorization', `Bearer ${localStorage.getItem('token')}`)
  return next(req)
})

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)
```

> 注意：`withInterceptors` 接受**工厂函数**（`() => Interceptor`），而非拦截器实例。这允许在 Vue provide 阶段按需创建实例。

## SSE 和 WebSocket 示例

客户端实例支持与核心包相同的 SSE 和 WebSocket 用法：

```typescript
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineEventStream, defineWebSocket, struct } from '@defjs/core'

const client = injectClient()

// SSE
const notifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({ id: struct.number(), text: struct.string() }),
  },
})

const [error, stream] = await client.execute(notifications())
if (!error) {
  for await (const event of stream) {
    console.log(event.message) // 类型为 { id: number, text: string }
  }
}

// WebSocket
const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})

const [wsError, ws] = await client.execute(chat())
if (!wsError) {
  ws.send({ type: 'send', data: { text: 'Hello' } })
  for await (const msg of ws.receive) {
    console.log(msg.message)
  }
}
</script>
```

更多传输细节，请参阅：

- [核心文档](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` 完整用法
- [SSE 文档](/core/sse) — SSE 自动重连、心跳和背压
- [WebSocket 文档](/core/web-socket) — WebSocket 连接和消息类型

## API 参考

### `provideClient(...feature: ClientOption[]): Plugin`

创建 Vue 插件。安装时，通过 `createClient(...)` 构建 `Client` 实例，并使用 `HTTP_CLIENT` 作为注入键将其提供给应用上下文。

### `injectClient(): Client`

在组件 `setup` 或组合式函数中调用，以获取注入的客户端实例。如果之前未调用 `app.use(provideClient(...))`，将抛出运行时错误：

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

配置 HTTP 请求的基础 URL。如果省略，请求默认以 `document.location.origin` 为前缀。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

配置拦截器。每个工厂在插件安装期间执行，返回的拦截器按注册顺序形成洋葱模型调用链。

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`，用于底层 `provide` / `inject` 的键。通常不需要直接使用，但可用于自定义注入层级：

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## 下一步

- [核心文档](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` 完整用法
