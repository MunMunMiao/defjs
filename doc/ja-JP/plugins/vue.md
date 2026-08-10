---
title: Vue
description: Vue の injection で Defjs クライアントを共有し、API に合わせて設定し、SSR リクエストスコープとリソースのクリーンアップを管理します。
---

# `@defjs/vue`

`@defjs/vue` は `@defjs/core` 用の薄い injection アダプターです。次をエクスポートします。

- `provideClient(...)`: Core クライアントを作成して provide する Vue プラグイン
- `injectClient()`: 最も近い階層で inject されたクライアントを返す関数
- `HTTP_CLIENT`: 上書きに使う injection キー
- アダプターの `withEndpoint(...)` と、インターセプターファクトリー用の `withInterceptors(...)` ヘルパー

トランスポート動作、キャッシュ、状態管理、再試行、Nuxt モジュールは追加しません。`@defjs/core` と Vue と一緒にインストールし、これらの責務はアプリケーションの composable、store、フレームワーク統合に置いてください。

## プラグインをインストールする

プラグインをインストールするたびに、クライアントが 1 つ作られます。

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` は Vue アダプターが再エクスポートまたは再実装しているオプションだけでなく、`@defjs/core` の任意の `ClientOption` を受け取ります。

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

プラグインのインストール時にオプションが実行され、クライアントが作られます。同じプラグインオブジェクトを別のアプリケーションにインストールすると、別のクライアントが作られます。

## 最も近いクライアントを inject する

`injectClient()` はコンポーネントの `setup`、`<script setup>`、または有効な composable/injection コンテキスト内で呼びます。

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

`HTTP_CLIENT` が見つからなければ例外を送出します。任意のモジュールスコープからは呼ばないでください。

Vue の通常の最寄りプロバイダー規則が適用されます。コンポーネントは子孫向けにクライアントを上書きできます。

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

このサブツリーの子孫が `injectClient()` を呼ぶと `scopedClient` を受け取ります。サブツリー外の兄弟要素は、引き続きアプリケーションレベルのクライアントを受け取ります。

## インターセプターファクトリー

アダプターの `withInterceptors(...)` はインターセプターのインスタンスではなくファクトリーを受け取ります。クライアントの作成時にファクトリーを評価し、オプション順で結果を追加します。

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

Core の `withInterceptors(...)` は作成済みインターセプター値を受け取るため、挙動が異なります。サーバー認証情報ファクトリーはリクエストスコープに保ってください。

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

設定がブラウザーで安全に扱え、リクエストに依存しないなら、ブラウザーアプリケーションはプラグインクライアントを 1 つインストールできます。

SSR では、リクエストヘッダー、Cookie、ユーザーデータ、テナントデータを、リクエスト間で共有するアプリケーションのシングルトンに取り込まないでください。各サーバーリクエスト境界内で Core クライアントを作り、そのリクエストのレンダーツリー内だけで渡すか provide します。

アダプターは、並行する SSR リクエスト間でアプリケーションのクロージャを分離しません。どの受信ヘッダーや Cookie を転送してよいかも判断しません。

Nuxt のクライアントプラグインは、ブラウザー側の利用コード向けに Vue アダプターをインストールできます。

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

`.client.ts` 接尾辞があるため、これはブラウザー専用です。サーバーリクエスト用のクライアントではなく、SSR 認証情報の転送には使えません。Nuxt アプリケーションでは、実際に使うプラグイン、route handler、hydration 設定と合わせてこの境界をテストしてください。

## リソースの所有権

Vue プロバイダーをインストールまたはアンマウントしても、HTTP 処理の中断や SSE/WebSocket リソースのクローズは行われません。アダプターはクライアントを作るだけで、Core クライアントに `dispose()` メソッドはありません。

リアルタイム処理を開始したコンポーネント、composable、ルート、ストアは、次を行う必要があります。

- 非同期起動の前または同時にクリーンアップを登録する
- スコープ終了時に起動処理を中断する
- 破棄後に届いたハンドルまたはセッションをクローズする
- `stream` または `session.receive` を継続して消費する
- アクティブなリソースに対して `stream.close(...)` または `session.close(...)` を呼ぶ
- WebSocket オブザーバーの購読を解除する

状態リスナーだけを付けて、有限の受信キューを読まないまま WebSocket を開かないでください。オーバーフローはセッションを致命的に終了します。ライフサイクルの詳細は [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) を参照してください。

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

## 次に読む

- [Client](/ja-JP/core/client) — Core オプション合成とクライアントスコープ
- [Commands](/ja-JP/core/commands) — エンドポイント定義とコマンド入力
- [Interceptors](/ja-JP/core/interceptors) — Core インターセプター契約
