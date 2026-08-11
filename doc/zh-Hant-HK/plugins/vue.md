---
title: Vue
description: 透過 Vue injection 共用 Defjs client、按自己的 API 設定、保留 SSR request scope，並清理 transport resource。
---

# `@defjs/vue`

此套件是 `@defjs/core` 的輕量 injection adapter。`createClientPlugin(client)` 提供由應用程式建立的 client，`injectClient()` 回傳最近的 instance，`HTTP_CLIENT` 用於 native subtree override；它不加入 client factory、cache、retry policy 或 resource lifecycle。

## 安裝 Plugin

使用 `@defjs/core` 建立並設定 client，再為這個確切 instance 安裝 plugin：

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

plugin 只負責提供傳入的 instance，不會建立、複製、替換或 dispose client。

## 注入 Nearest Client

在 `setup`、`<script setup>` 或有效 injection context 內呼叫 `injectClient()`。缺少 `HTTP_CLIENT` 時會拋錯，並遵循 Vue 的 nearest-provider 規則。

使用公開 key 和 Vue native `provide` 覆蓋某個 subtree：

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

先建立 interceptor value，並用 core 的 `withInterceptors(...)` 組合，再安裝 plugin：

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

如果 interceptor factory 捕捉 request-scoped credential，應在建立該 client 的 request boundary 內呼叫。

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

browser app 可安裝一個 browser-safe client。SSR 應在每個 server request boundary 內建立獨立 core client，並只向對應 app 提供該 instance；不要跨 request 共用 header、cookie、tenant state 或 credential。

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## Resource Ownership

安裝或卸載 plugin 不會 abort HTTP，也不會關閉 SSE 和 WebSocket resource。建立 client 的呼叫方擁有透過它啟動的全部工作。

- 在 async startup 前或同時註冊 cleanup；
- scope 結束時 abort startup；
- disposal 後才到達的 handle 或 session 要立即關閉；
- 持續讀取 `stream` 或 `session.receive`；
- 對 active 資源呼叫 `stream.close(...)` 或 `session.close(...)`；
- unsubscribe WebSocket observer。

不要只為加入 state listener 就開啟 WebSocket，卻一直不讀取有限 incoming queue；overflow 會 fatal 終止 session。完整 lifecycle 規則見 [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)。

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

建立一個提供傳入 client instance 的 Vue plugin。

回傳最近的 client；沒有 provider 時拋錯。

用於 native subtree provider 的公開 injection key。

## 下一步

- [Client](/zh-Hant-HK/core/client)：core option composition 與 client scope。
- [Commands](/zh-Hant-HK/core/commands)：endpoint 定義與 command input。
- [Interceptors](/zh-Hant-HK/core/interceptors)：core interceptor contract。
