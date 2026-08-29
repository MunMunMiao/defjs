---
title: '@defjs/vue'
description: プラグイン、injection key、injectClient です。
---

# Vue {#page}

既存の `@defjs/core` クライアントを Vue に繋ぎます。このパッケージはクライアントを**作らず**、結果をキャッシュせず、unmount でトランスポートも閉じません。

[Vue ガイド](../plugins/vue.md) を見てください。

## createClientPlugin() {#createClientPlugin}

```ts
function createClientPlugin(client: Client): Plugin
```

- **client** — `createClient` のインスタンスです。
- **戻り値** `app.use(...)` 用の Vue プラグインです。

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'
import { createApp } from 'vue'

const client = createClient(withEndpoint('https://api.example.com'))
const app = createApp(App)
app.use(createClientPlugin(client))
```

## injectClient() {#injectClient}

```ts
function injectClient(): Client
```

一番近い `HTTP_CLIENT` provider を読みます。

- **戻り値** 注入されたクライアントです。
- **例外** プラグインが入っていないときです。

## HTTP_CLIENT {#HTTP_CLIENT}

```ts
const HTTP_CLIENT: InjectionKey<Client>
```

Vue の injection key です。`inject(HTTP_CLIENT)` より `injectClient()` を使ってください。サブツリーの上書きは `provide(HTTP_CLIENT, childClient)` です。
