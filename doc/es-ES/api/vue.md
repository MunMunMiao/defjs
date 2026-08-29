---
title: '@defjs/vue'
description: Plugin, injection key e injectClient.
---

# Vue {#page}

Conecta un cliente `@defjs/core` existente a Vue. El paquete **no** crea clientes, no cachea resultados ni cierra el transporte al unmount.

Mira la [guía de Vue](../plugins/vue.md).

## createClientPlugin() {#createClientPlugin}

```ts
function createClientPlugin(client: Client): Plugin
```

- **client** — Instancia de `createClient`.
- **Devuelve** un plugin de Vue para `app.use(...)`.

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

Lee el provider `HTTP_CLIENT` más cercano.

- **Devuelve** el cliente inyectado.
- **Lanza** si no instalaste el plugin.

## HTTP_CLIENT {#HTTP_CLIENT}

```ts
const HTTP_CLIENT: InjectionKey<Client>
```

Injection key de Vue. Prefiere `injectClient()` a `inject(HTTP_CLIENT)`. Para un subárbol: `provide(HTTP_CLIENT, childClient)`.
