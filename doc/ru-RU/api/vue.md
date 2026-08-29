---
title: '@defjs/vue'
description: Плагин, injection key и injectClient.
---

# Vue {#page}

Подключи существующий `@defjs/core` client к Vue. Пакет **не** создаёт client, не кэширует результаты и не закрывает транспорт на unmount.

См. [гайд Vue](../plugins/vue.md).

## createClientPlugin() {#createClientPlugin}

```ts
function createClientPlugin(client: Client): Plugin
```

- **client** — Экземпляр из `createClient`.
- **Возвращает** Vue-плагин для `app.use(...)`.

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

Читает ближайший `HTTP_CLIENT` provider.

- **Возвращает** внедрённый client.
- **Бросает** если плагин не поставили.

## HTTP_CLIENT {#HTTP_CLIENT}

```ts
const HTTP_CLIENT: InjectionKey<Client>
```

Vue injection key. Бери `injectClient()`, а не `inject(HTTP_CLIENT)`. Поддерево: `provide(HTTP_CLIENT, childClient)`.
