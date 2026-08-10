---
title: Vue
description: 透過 Vue injection 共用 Defjs client、按自己的 API 設定、保留 SSR request scope，並清理 transport resource。
---

# `@defjs/vue`

`@defjs/vue` 是 `@defjs/core` 的輕量 injection adapter，匯出：

- `provideClient(...)`：建立並提供 core client 的 Vue plugin；
- `injectClient()`：回傳 nearest injected client；
- `HTTP_CLIENT`：用於 override 的 injection key；
- adapter `withEndpoint(...)` 與 interceptor-factory `withInterceptors(...)` helper。

它不會加入 transport behavior、cache、state management、retry 或 Nuxt module。請連同 `@defjs/core`、Vue 一起安裝，這些責任則留在應用程式自己的 composable、store 同 framework integration。

## 安裝 Plugin

每次 plugin installation 都會建立一個 client：

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` 接受 `@defjs/core` 的任何 `ClientOption`，不限於 Vue adapter re-export 或重新建立的 option：

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

這些 option 會在 plugin install 並建立 client 時執行。同一 plugin object 安裝至另一 app 時，會建立另一個 client。

## 注入 Nearest Client

請在 component `setup`、`<script setup>`，或 active composable/injection context 內呼叫 `injectClient()`：

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

沒有可用 `HTTP_CLIENT` 時會拋錯。不要在任意 module scope 呼叫。

Vue 一般 nearest-provider 規則仍然適用。Component 可以為 descendants 提供 override：

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

Descendant 呼叫 `injectClient()` 會得到 `scopedClient`；subtree 以外的 sibling 仍取得 app-level client。

## Interceptor Factory

Adapter `withInterceptors(...)` 接受 factory，而不是 interceptor instance。建立 client 時會執行 factory，並按 option order 追加結果。

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

這與 core `withInterceptors(...)` 不同；後者接收已建立的 interceptor value。Server 端 credential factory 必須保持 request-scoped。

## 回應 Input 變更

把 HTTP 工作綁定至真正觸發它的 reactive value。單用 `onMounted` 只會讀取初始 prop；`watch` 配合 cleanup 才可取消已被新值取代的工作：

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

Imported `getUser` command builder 擁有 endpoint contract；component 則負責在 `id` 改變或 unmount 時取消 request。

## SSR Boundary

設定只包含 browser-safe、request-independent 資料時，瀏覽器應用程式可以安裝一個 plugin client。

SSR 不要讓 request header、cookie、user data 或 tenant data 被 capture 到 cross-request app singleton。請在每個 server request boundary 內建立 core client，並只在該 request 的 render tree 傳遞或 provide。

Adapter 不會在 concurrent SSR request 之間隔離應用程式 closure，亦不會替應用程式決定哪些 inbound header 或 cookie 可以安全 forward。

Nuxt client plugin 可以為 browser consumer 安裝 Vue adapter：

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

`.client.ts` suffix 表示它只在 browser 執行。它不是 server-request client，不能用來 forward SSR credentials。在 Nuxt 應用程式，請連同實際 plugin、route handler 同 hydration setup 測試這個 boundary。

## Resource Ownership

安裝或 unmount Vue provider 不會 abort HTTP 工作，亦不會關閉 SSE 或 WebSocket 資源。Adapter 只建立 client，而 core client 沒有 `dispose()` method。

開始 realtime 工作的 component、composable、route 或 store 必須：

- 在 async startup 前或同時註冊 cleanup；
- scope 結束時 abort startup；
- disposal 後才到達的 handle 或 session 要立即關閉；
- 持續讀取 `stream` 或 `session.receive`；
- 對 active 資源呼叫 `stream.close(...)` 或 `session.close(...)`；
- unsubscribe WebSocket observer。

不要只為加入 state listener 就開啟 WebSocket，卻一直不讀取有限 incoming queue；overflow 會 fatal 終止 session。完整 lifecycle 規則見 [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)。

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

- [Client](/zh-Hant-HK/core/client)：core option composition 與 client scope。
- [Commands](/zh-Hant-HK/core/commands)：endpoint 定義與 command input。
- [Interceptors](/zh-Hant-HK/core/interceptors)：core interceptor contract。
