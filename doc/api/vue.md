---
title: '@defjs/vue'
description: Vue plugin, injection key, and injectClient.
---

# Vue {#page}

Provide an existing `@defjs/core` client to a Vue app. This package does not create, cache, or dispose the client.

See the [Vue guide](/plugins/vue).

## createClientPlugin() {#createClientPlugin}

```ts
function createClientPlugin(client: Client): Plugin
```

- **client** — Instance from `createClient`.
- **Returns** a Vue plugin for `app.use(...)`.

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

Reads the nearest `HTTP_CLIENT` provider.

- **Returns** the injected client.
- **Throws** if the plugin was not installed.

## HTTP_CLIENT {#HTTP_CLIENT}

```ts
const HTTP_CLIENT: InjectionKey<Client>
```

Vue injection key. Prefer `injectClient()` over `inject(HTTP_CLIENT)`. Override a subtree with `provide(HTTP_CLIENT, childClient)`.
