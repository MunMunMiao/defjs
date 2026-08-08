---
title: Vue
description: Vue injection으로 Defjs 클라이언트를 공유하고 API에 맞게 설정하며 SSR 요청 범위와 트랜스포트 정리를 관리합니다.
---

# `@defjs/vue`

`@defjs/vue`는 `@defjs/core`를 위한 가벼운 injection adapter입니다. 다음 항목을 export합니다.

- core 클라이언트를 만들고 provide하는 Vue plugin `provideClient(...)`
- 가장 가까이 inject된 클라이언트를 반환하는 `injectClient()`
- override에 사용하는 injection key `HTTP_CLIENT`
- adapter의 `withEndpoint(...)` 및 interceptor factory용 `withInterceptors(...)` helper

트랜스포트 동작, caching, state management, retry, Nuxt module을 추가하지 않습니다. `@defjs/core`, Vue와 함께 설치하고 이런 책임은 애플리케이션 composable, store, framework 통합에 두세요.

## Plugin 설치

plugin을 설치할 때마다 클라이언트 하나를 만듭니다.

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)`는 Vue adapter가 다시 export하거나 만든 옵션뿐 아니라 `@defjs/core`의 모든 `ClientOption`을 받습니다.

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

plugin을 설치하고 클라이언트를 만들 때 옵션이 실행됩니다. 같은 plugin 객체를 다른 app에 설치하면 별도의 클라이언트가 만들어집니다.

## 가장 가까운 클라이언트 inject

component `setup`, `<script setup>`, 활성 composable/injection context 안에서 `injectClient()`를 호출하세요.

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

`HTTP_CLIENT`가 없으면 throw합니다. 임의의 module scope에서 호출하지 마세요.

Vue의 일반적인 nearest-provider 규칙을 따릅니다. component가 descendant용 override를 provide할 수 있습니다.

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

descendant에서 `injectClient()`를 호출하면 `scopedClient`를 받습니다. 이 subtree 밖의 sibling은 계속 app-level 클라이언트를 받습니다.

## Interceptor factory

adapter의 `withInterceptors(...)`는 인터셉터 instance가 아니라 factory를 받습니다. 클라이언트가 만들어질 때 factory를 평가하고 그 결과를 옵션 순서대로 추가합니다.

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

이미 만들어진 인터셉터 값을 받는 core `withInterceptors(...)`와 다른 점입니다. 서버 credential factory는 요청 범위로 유지하세요.

## 입력 변화에 반응하기

HTTP 작업을 그 작업을 시작한 reactive 값에 연결하세요. `onMounted`만 사용하면 최초 prop만 읽습니다. `watch`와 cleanup을 함께 사용하면 대체된 작업을 취소할 수 있습니다.

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

import한 `getUser` 커맨드 빌더가 엔드포인트 계약을 소유합니다. 이 컴포넌트는 `id`가 바뀌거나 unmount될 때 취소하는 책임을 집니다.

## SSR 경계

설정이 브라우저에서 안전하고 요청과 무관하다면 브라우저 app에 plugin 클라이언트 하나를 설치할 수 있습니다.

SSR에서는 요청 header, cookie, 사용자 또는 tenant 데이터를 여러 요청이 공유하는 app singleton에 capture하지 마세요. 서버 요청 경계마다 core 클라이언트를 만들고 해당 요청의 render tree 안에서만 전달하거나 provide하세요.

adapter는 동시에 실행되는 SSR 요청 사이에서 애플리케이션 closure를 격리하지 않습니다. 어떤 inbound header나 cookie를 전달해도 안전한지도 결정하지 않습니다.

Nuxt client plugin은 브라우저 consumer를 위해 Vue adapter를 설치할 수 있습니다.

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

`.client.ts` suffix는 이 코드를 브라우저 전용으로 만듭니다. 서버 요청 클라이언트가 아니며 SSR credential을 전달하는 데 사용하면 안 됩니다. Nuxt 애플리케이션에서는 실제 plugin, route handler, hydration 설정과 함께 이 경계를 테스트하세요.

## 리소스 소유권

Vue 프로바이더를 설치하거나 unmount해도 HTTP 작업을 abort하거나 SSE·WebSocket 리소스를 닫지 않습니다. adapter는 클라이언트를 만들 뿐이며 core 클라이언트에는 `dispose()` method가 없습니다.

realtime 작업을 시작한 컴포넌트, composable, route 또는 store는 다음 작업을 해야 합니다.

- 비동기 시작 전이나 동시에 cleanup을 등록합니다.
- scope가 끝나면 시작 작업을 abort합니다.
- dispose 후 뒤늦게 도착한 handle 또는 session을 닫습니다.
- `stream` 또는 `session.receive`를 계속 소비합니다.
- 활성 리소스에 `stream.close(...)` 또는 `session.close(...)`를 호출합니다.
- WebSocket observer를 구독 해제합니다.

무제한 incoming queue를 읽지 않은 채 state listener만 붙이려고 WebSocket을 열지 마세요. 전체 생명주기 규칙은 [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)을 참고하세요.

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

## 다음 단계

- [클라이언트](/ko-KR/core/client)에서는 core 옵션 조합과 클라이언트 범위를 설명합니다.
- [커맨드](/ko-KR/core/commands)에서는 엔드포인트 정의와 커맨드 입력을 설명합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 core interceptor 계약을 설명합니다.
