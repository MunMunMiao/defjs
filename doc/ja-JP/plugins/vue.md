---
title: Vue
description: Vue の injection で Defjs クライアントを共有し、API に合わせて設定し、SSR リクエストスコープとリソースのクリーンアップを管理します。
---

# `@defjs/vue`

このパッケージは `@defjs/core` 用の薄い injection アダプターです。`createClientPlugin(client)` はアプリケーションが作成した client を提供し、`injectClient()` は最も近い instance を返し、`HTTP_CLIENT` は native subtree override に使えます。client factory、cache、retry、resource lifecycle は追加しません。

## プラグインをインストールする

`@defjs/core` で client を作成・設定し、その同一 instance 用の plugin を install します。

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

plugin は渡された instance を提供するだけです。client の作成、clone、差し替え、dispose は行いません。

## 最も近いクライアントを inject する

`injectClient()` は `setup`、`<script setup>`、または有効な injection context 内で呼び出します。`HTTP_CLIENT` がなければ例外になり、Vue の通常の最寄り provider 規則が適用されます。

subtree override には公開 key と Vue native の `provide` を使います。

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

## インターセプターファクトリー

interceptor value を作り、core の `withInterceptors(...)` で合成してから plugin を install します。

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

factory が request 固有の credential を捕捉する場合は、その client を作成する request boundary 内で呼び出してください。

## 入力の変更に追従する

HTTP 処理は、処理を開始するリアクティブな値と結び付けます。`onMounted` だけでは最初の prop しか読みません。`watch` とクリーンアップを使うと、古くなった処理をキャンセルできます。

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

import した `getUser` コマンドビルダーがエンドポイント契約を所有します。このコンポーネントは、`id` の変更時とアンマウント時のキャンセルを所有します。

## SSR 境界

browser app には browser-safe な client を install できます。SSR では server request boundary ごとに別の core client を作成し、対応する app にその instance だけを提供してください。header、cookie、tenant state、credential を request 間で共有しないでください。

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## リソースの所有権

plugin の install や unmount は HTTP を abort せず、SSE や WebSocket resource も閉じません。client を作成した呼び出し側が、それを通じて開始したすべての処理を所有します。

- 非同期起動の前または同時にクリーンアップを登録する
- スコープ終了時に起動処理を中断する
- 破棄後に届いたハンドルまたはセッションをクローズする
- `stream` または `session.receive` を継続して消費する
- アクティブなリソースに対して `stream.close(...)` または `session.close(...)` を呼ぶ
- WebSocket オブザーバーの購読を解除する

状態リスナーだけを付けて、有限の受信キューを読まないまま WebSocket を開かないでください。オーバーフローはセッションを致命的に終了します。ライフサイクルの詳細は [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) を参照してください。

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

渡された client instance を提供する Vue plugin を作成します。

最も近い client を返し、存在しなければ例外を投げます。

native subtree provider 用の公開 injection key です。

## 次に読む

- [Client](/ja-JP/core/client) — Core オプション合成とクライアントスコープ
- [Commands](/ja-JP/core/commands) — エンドポイント定義とコマンド入力
- [Interceptors](/ja-JP/core/interceptors) — Core インターセプター契約
