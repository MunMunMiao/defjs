---
title: Vue
description: Vue injection으로 Defjs 클라이언트를 공유하고 API에 맞게 설정하며 SSR 요청 범위와 트랜스포트 정리를 관리합니다.
---

# `@defjs/vue`

이 패키지는 `@defjs/core`용 얇은 injection adapter입니다. `createClientPlugin(client)`는 애플리케이션이 만든 client를 제공하고, `injectClient()`는 가장 가까운 instance를 반환하며, `HTTP_CLIENT`는 native subtree override에 사용합니다. client factory, cache, retry, resource lifecycle은 추가하지 않습니다.

## Plugin 설치

`@defjs/core`에서 client를 생성하고 구성한 뒤 그 동일한 instance용 plugin을 설치합니다.

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

plugin은 전달된 instance만 제공합니다. client를 생성, 복제, 교체 또는 dispose하지 않습니다.

## 가장 가까운 클라이언트 inject

`injectClient()`는 `setup`, `<script setup>` 또는 활성 injection context 안에서 호출합니다. `HTTP_CLIENT`가 없으면 오류를 던지며 Vue의 일반적인 가장 가까운 provider 규칙을 따릅니다.

subtree override에는 공개 key와 Vue native `provide`를 사용합니다.

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

## Interceptor factory

interceptor value를 만들고 core의 `withInterceptors(...)`로 조합한 뒤 plugin을 설치합니다.

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

factory가 request별 credential을 캡처한다면 해당 client를 만드는 request boundary 안에서 호출하세요.

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

browser app에는 browser-safe client를 설치할 수 있습니다. SSR에서는 server request boundary마다 별도 core client를 만들고 해당 app에 그 instance만 제공하세요. header, cookie, tenant state, credential을 request 사이에 공유하면 안 됩니다.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## 리소스 소유권

plugin 설치나 unmount는 HTTP를 abort하거나 SSE 및 WebSocket resource를 닫지 않습니다. client를 만든 호출자가 이를 통해 시작한 모든 작업을 소유합니다.

- 비동기 시작 전이나 동시에 cleanup을 등록합니다.
- scope가 끝나면 시작 작업을 abort합니다.
- dispose 후 뒤늦게 도착한 handle 또는 session을 닫습니다.
- `stream` 또는 `session.receive`를 계속 소비합니다.
- 활성 리소스에 `stream.close(...)` 또는 `session.close(...)`를 호출합니다.
- WebSocket observer를 구독 해제합니다.

유한 incoming queue를 읽지 않은 채 state listener만 붙이려고 WebSocket을 열지 마세요. overflow는 세션을 fatal 종료합니다. 전체 생명주기 규칙은 [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)을 참고하세요.

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

전달된 client instance를 제공하는 Vue plugin을 만듭니다.

가장 가까운 client를 반환하며 없으면 오류를 던집니다.

native subtree provider용 공개 injection key입니다.

## 다음 단계

- [클라이언트](/ko-KR/core/client)에서는 core 옵션 조합과 클라이언트 범위를 설명합니다.
- [커맨드](/ko-KR/core/commands)에서는 엔드포인트 정의와 커맨드 입력을 설명합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 core interceptor 계약을 설명합니다.
