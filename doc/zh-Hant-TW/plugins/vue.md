---
title: Vue
description: 透過 Vue injection 共用 Defjs 用戶端、依自己的 API 設定、維持 SSR 請求範圍，並清理 transport 資源。
---

# `@defjs/vue`

`@defjs/vue` 是 `@defjs/core` 的輕量 injection 轉接器，匯出：

- `provideClient(...)`：建立並提供 core client 的 Vue plugin；
- `injectClient()`：回傳最近一層注入的 client；
- `HTTP_CLIENT`：用於 override 的 injection key；
- 轉接器的 `withEndpoint(...)`，以及攔截器 factory helper `withInterceptors(...)`。

它不會增加 transport 行為、cache、state management、retry 或 Nuxt module。請和 `@defjs/core`、Vue 一起安裝，這些責任則留在應用程式自己的 composable、store 與 framework integration。

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

`provideClient(...options)` 接受 `@defjs/core` 的任何 `ClientOption`，不限於 Vue adapter 重新匯出或建立的選項：

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Plugin 安裝並建立 client 時才會執行選項。把同一個 plugin object 安裝到另一個 app，會另外建立一個 client。

## 注入最近一層 Client

請在 component `setup`、`<script setup>`，或 active composable/injection context 中呼叫 `injectClient()`：

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

找不到 `HTTP_CLIENT` 時會 throw。不要在任意 module scope 呼叫它。

這裡遵循 Vue 一般的 nearest-provider 規則。Component 可以為 descendants 提供 override：

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

Descendant 呼叫 `injectClient()` 會取得 `scopedClient`；這個 subtree 以外的 sibling 仍會取得 app-level client。

## 攔截器 Factory

Adapter 的 `withInterceptors(...)` 接受 factory，不接受 interceptor instance。Client 建立時會 evaluate 這些 factory，再依 option order 附加結果。

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

這和 core `withInterceptors(...)` 不同，後者接受已建立的 interceptor value。伺服器端 credential factory 必須維持 request-scoped。

## 回應輸入變更

把 HTTP 工作繫結到實際啟動它的 reactive value。只用 `onMounted` 只會讀到初始 prop；`watch` 搭配 cleanup 才能取消已被新值取代的工作：

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

匯入的 `getUser` 指令建構器擁有端點契約。這個 component 則負責在 `id` 改變或 component unmount 時取消工作。

## SSR 邊界

若設定在瀏覽器中可安全使用而且不依賴個別 request，瀏覽器 app 可以安裝一個 plugin client。

SSR 不應把 request header、cookie、使用者資料或 tenant data 捕捉進跨 request 共用的 app singleton。請在每個 server request boundary 內建立 core client，並只在該 request 的 render tree 傳遞或 provide。

Adapter 不會隔離並行 SSR request 之間的應用程式 closure，也不會替你決定哪些 inbound header 或 cookie 可以安全轉送。

Nuxt client plugin 可以為瀏覽器 consumer 安裝 Vue adapter：

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

`.client.ts` suffix 讓它只在瀏覽器執行。它不是 server-request client，不能用來轉送 SSR credential。在 Nuxt 應用程式中，請連同實際 plugin、route handler 與 hydration 設定測試這個邊界。

## 資源歸屬

安裝或 unmount Vue provider 不會 abort HTTP 工作，也不會關閉 SSE 與 WebSocket 資源。Adapter 只建立 client，而 core client 沒有 `dispose()` method。

啟動 realtime 工作的 component、composable、route 或 store 必須：

- 在 async startup 前或同時註冊 cleanup；
- scope 結束時 abort startup；
- 已 dispose 後才抵達的 handle 或 session 要立即關閉；
- 持續消費 `stream` 或 `session.receive`；
- 對 active resource 呼叫 `stream.close(...)` 或 `session.close(...)`；
- unsubscribe WebSocket observer。

不要只為了掛 state listener 就開啟 WebSocket，卻完全不讀有限 incoming queue；overflow 會 fatal 終止 session。完整生命週期規則請見 [SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)。

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

- [Client](/zh-Hant-TW/core/client)說明 core option composition 與 client scope。
- [指令](/zh-Hant-TW/core/commands)說明端點定義與 command input。
- [攔截器](/zh-Hant-TW/core/interceptors)說明 core interceptor contract。
