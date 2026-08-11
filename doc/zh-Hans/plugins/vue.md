---
title: Vue
description: 通过 Vue injection 共享 Defjs client，按自己的 API 配置它，保留 SSR 请求作用域，并清理 transport 资源。
---

# `@defjs/vue`

该包是 `@defjs/core` 的轻量 injection 适配器。`createClientPlugin(client)` 提供由应用创建的 client，`injectClient()` 返回最近的实例，`HTTP_CLIENT` 用于原生 subtree 覆盖；它不增加 client 工厂、缓存、重试策略或资源生命周期。

## 安装 Plugin

使用 `@defjs/core` 创建并配置 client，再为这个确切实例安装 plugin：

```typescript
// main.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'
import { createApp } from 'vue'
import App from './App.vue'

const client = createClient(withEndpoint('https://api.example.com'))
const app = createApp(App)

app.use(createClientPlugin(client))
app.mount('#app')
```

plugin 只负责提供传入的实例，不会创建、复制、替换或销毁 client。

## 注入最近的 Client

在 `setup`、`<script setup>` 或有效的 injection context 内调用 `injectClient()`。缺少 `HTTP_CLIENT` 时它会抛错，并遵循 Vue 的最近 provider 规则。

使用公开 key 和 Vue 原生 `provide` 覆盖某个 subtree：

```vue
<script setup lang="ts">
import { createClient, withEndpoint } from '@defjs/core'
import { HTTP_CLIENT } from '@defjs/vue'
import { provide } from 'vue'

const scopedClient = createClient(withEndpoint('https://preview.example.com'))
provide(HTTP_CLIENT, scopedClient)
</script>

<template>
  <slot />
</template>
```

## Interceptor Factory

先创建 interceptor 值，并用 core 的 `withInterceptors(...)` 组合，再安装 plugin：

```typescript
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

const auth = createHttpInterceptor((request, next) => {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${readAccessToken()}`)
  return next({ ...request, headers })
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(auth))
app.use(createClientPlugin(client))
```

如果 interceptor 工厂捕获请求级凭据，应在创建该 client 的请求边界内调用它。

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

浏览器应用可安装一个浏览器安全的 client。SSR 应在每个服务端请求边界内创建独立 core client，并只向对应 app 提供该实例；不要跨请求共享 header、cookie、tenant 状态或凭据。

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## 资源所有权

安装或卸载 plugin 不会中止 HTTP，也不会关闭 SSE 和 WebSocket 资源。创建 client 的调用方拥有通过它启动的全部工作。

- 在 async startup 之前或同时注册 cleanup；
- scope 结束时 abort startup；
- 已释放后才到达的 handle 或 session 要立即关闭；
- 持续消费 `stream` 或 `session.receive`；
- 对 active resource 调用 `stream.close(...)` 或 `session.close(...)`；
- unsubscribe WebSocket observer。

不要只为添加 state listener 就打开 WebSocket，却让有限 incoming queue 一直无人读取；overflow 会 fatal 终止 session。完整生命周期规则见 [SSE](/zh-Hans/core/sse) 和 [WebSocket](/zh-Hans/core/web-socket)。

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

创建一个提供传入 client 实例的 Vue plugin。

返回最近的 client；没有 provider 时抛错。

用于原生 subtree provider 的公开 injection key。

## 下一步

- [Client](/zh-Hans/core/client)：core option 组合和 client 作用域。
- [Commands](/zh-Hans/core/commands)：端点定义和 command input。
- [Interceptors](/zh-Hans/core/interceptors)：core interceptor contract。
