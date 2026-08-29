---
title: '@defjs/vue'
description: Install plugin、injection key、injectClient。
---

# Vue {#page}

將現有 `@defjs/core` client wire 入 Vue。Package **唔會** create client、cache results，或者喺 unmount 時 close transport。

見 [Vue 指南](../plugins/vue.md)。

## createClientPlugin() {#createClientPlugin}

```ts
function createClientPlugin(client: Client): Plugin
```

- **client** — `createClient` 俾嘅實例。
- **回傳** 畀 `app.use(...)` 用嘅 Vue plugin。

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

讀最近嘅 `HTTP_CLIENT` provider。

- **回傳** 注入嘅 client。
- **拋出** 未裝 plugin 嗰陣。

## HTTP_CLIENT {#HTTP_CLIENT}

```ts
const HTTP_CLIENT: InjectionKey<Client>
```

Vue injection key。優先用 `injectClient()`，唔好直接 `inject(HTTP_CLIENT)`。子樹覆蓋：`provide(HTTP_CLIENT, childClient)`。
