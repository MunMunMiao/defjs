---
title: '@defjs/vue'
description: Plugin, Injection-Key und injectClient.
---

# Vue {#page}

Verdrahte einen bestehenden `@defjs/core`-Client in Vue. Das Paket erzeugt **keine** Clients, cached keine Results und schließt Transport-Resources bei Unmount nicht.

Sieh den [Vue-Guide](../plugins/vue.md).

## createClientPlugin() {#createClientPlugin}

```ts
function createClientPlugin(client: Client): Plugin
```

- **client** — Instanz von `createClient`.
- **Gibt zurück** Vue-Plugin für `app.use(...)`.

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

Liest den nächsten `HTTP_CLIENT`-Provider.

- **Gibt zurück** den injizierten Client.
- **Wirft** wenn das Plugin fehlt.

## HTTP_CLIENT {#HTTP_CLIENT}

```ts
const HTTP_CLIENT: InjectionKey<Client>
```

Vue-Injection-Key. Nimm `injectClient()` statt `inject(HTTP_CLIENT)`. Subtree überschreiben: `provide(HTTP_CLIENT, childClient)`.
