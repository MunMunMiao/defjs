---
title: Vue
description: 通过 Vue injection 共享 Defjs client，按自己的 API 配置它，保留 SSR 请求作用域，并清理 transport 资源。
---

# `@defjs/vue`

`@defjs/vue` 是 `@defjs/core` 的轻量 injection adapter。它导出：

- `provideClient(...)`：创建并提供 core client 的 Vue plugin；
- `injectClient()`：返回最近一层注入的 client；
- `HTTP_CLIENT`：用于 override 的 injection key；
- adapter `withEndpoint(...)` 和 interceptor-factory `withInterceptors(...)` helper。

它不会添加 transport 行为、cache、state management、retry 或 Nuxt module。请和 `@defjs/core`、Vue 一起安装，并把这些职责留在应用自己的 composable、store 和 framework integration 中。

## 安装 Plugin

每次安装 plugin 都会创建一个 client：

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` 接受 `@defjs/core` 的任意 `ClientOption`，不限于 Vue adapter 重新导出或创建的 option：

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Plugin 安装并创建 client 时会执行这些 option。把同一个 plugin object 安装到另一个 app，会再创建一个 client。

## 注入最近的 Client

请在 component `setup`、`<script setup>` 或 active composable/injection context 中调用 `injectClient()`：

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

没有可用的 `HTTP_CLIENT` 时，它会抛错。不要在任意 module scope 调用。

Vue 正常的 nearest-provider 规则仍然适用。Component 可以为后代提供 override：

```vue
<script setup lang="ts">
import { provide } from 'vue'
import { createClient, withEndpoint } from '@defjs/core'
import { HTTP_CLIENT } from '@defjs/vue'

const scopedClient = createClient(withEndpoint('https://preview.example.com'))
provide(HTTP_CLIENT, scopedClient)
</script>

<template>
  <slot />
</template>
```

后代调用 `injectClient()` 会得到 `scopedClient`；这个 subtree 以外的 sibling 仍得到 app-level client。

## Interceptor Factory

Adapter 的 `withInterceptors(...)` 接受 factory，不接受 interceptor instance。创建 client 时，它会执行这些 factory，并按 option 顺序追加结果。

```typescript
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
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

app.use(provideClient(withEndpoint('https://api.example.com'), withInterceptors(createAuthInterceptor)))
```

这与 core `withInterceptors(...)` 不同，后者接收已经创建好的 interceptor value。服务端 credential factory 必须保持 request-scoped。

## 响应输入变化

把 HTTP 工作绑定到真正发起它的 reactive value。只用 `onMounted` 只能读取初始 prop。`watch` 配合 cleanup 可以取消已被新值替代的工作：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { injectClient } from '@defjs/vue'
import { getUser } from './api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('')
const errorMessage = ref('')

watch(
  () => props.id,
  (id, _previousId, onCleanup) => {
    const abort = new AbortController()
    let current = true

    onCleanup(() => {
      current = false
      abort.abort()
    })

    void client
      .execute(getUser({ path: { id } }), { signal: abort.signal })
      .then(([error, user]) => {
        if (!current) {
          return
        }

        if (error) {
          errorMessage.value = 'Unable to load user.'
          return
        }

        errorMessage.value = ''
        name.value = user.name
      })
      .catch(() => {
        if (current) {
          errorMessage.value = 'Unable to load user.'
        }
      })
  },
  { immediate: true },
)
</script>

<template>
  <p v-if="errorMessage">{{ errorMessage }}</p>
  <p v-else>{{ name }}</p>
</template>
```

导入的 `getUser` command builder 负责 endpoint contract。这个 component 负责在 `id` 变化或 component unmount 时取消请求。

## SSR 边界

配置只包含 browser-safe、request-independent 数据时，浏览器应用可以安装一个 plugin client。

SSR 中，不要把 request header、cookie、user 数据或 tenant 数据捕获到跨请求 app singleton。请在每个服务端请求边界内创建 core client，并且只在该请求的 render tree 内传递或 provide。

Adapter 不会在并发 SSR 请求之间隔离应用 closure，也不会替应用决定哪些入站 header 或 cookie 可以安全转发。

Nuxt client plugin 可以为浏览器 consumer 安装 Vue adapter：

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

`.client.ts` 后缀表示它只在浏览器运行。它不是 server-request client，不能用来转发 SSR credential。在 Nuxt 应用中，请结合实际 plugin、route handler 和 hydration 配置测试这个边界。

## 资源所有权

安装或卸载 Vue provider 不会 abort HTTP 工作，也不会关闭 SSE 和 WebSocket 资源。Adapter 只创建 client，而 core client 没有 `dispose()` 方法。

发起 realtime 工作的 component、composable、route 或 store 必须：

- 在 async startup 之前或同时注册 cleanup；
- scope 结束时 abort startup；
- 已释放后才到达的 handle 或 session 要立即关闭；
- 持续消费 `stream` 或 `session.receive`；
- 对 active resource 调用 `stream.close(...)` 或 `session.close(...)`；
- unsubscribe WebSocket observer。

不要只为添加 state listener 就打开 WebSocket，却让无界 incoming queue 一直无人读取。完整生命周期规则见 [SSE](/zh-Hans/core/sse) 和 [WebSocket](/zh-Hans/core/web-socket)。

## API

```typescript
import type { Client, ClientOption, Interceptor } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function provideClient(...options: ClientOption[]): Plugin
declare function injectClient(): Client
declare function withEndpoint(endpoint: string): ClientOption
declare function withInterceptors(...factories: (() => Interceptor)[]): ClientOption
```

## 下一步

- [Client](/zh-Hans/core/client)：core option 组合和 client 作用域。
- [Commands](/zh-Hans/core/commands)：端点定义和 command input。
- [Interceptors](/zh-Hans/core/interceptors)：core interceptor contract。
