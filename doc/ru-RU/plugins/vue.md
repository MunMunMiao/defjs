---
title: Vue
description: Передавайте клиент Defjs через provide/inject Vue, настраивайте его для своего API, сохраняйте scope SSR-запроса и закрывайте ресурсы транспорта.
---

# `@defjs/vue`

Этот пакет — тонкий injection-адаптер для `@defjs/core`. `createClientPlugin(client)` предоставляет созданный приложением клиент, `injectClient()` возвращает ближайший экземпляр, а `HTTP_CLIENT` позволяет делать нативные subtree overrides. Пакет не добавляет фабрику, кеш, retry или управление ресурсами.

## Установка плагина

Создайте и настройте клиент через `@defjs/core`, затем установите plugin для этого же экземпляра:

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

Plugin только предоставляет переданный экземпляр; он не создаёт, не клонирует, не заменяет и не освобождает клиент.

## Внедрение ближайшего клиента

Вызывайте `injectClient()` в `setup`, `<script setup>` или активном injection context. Без `HTTP_CLIENT` функция бросает ошибку; действует обычное правило ближайшего provider Vue.

Для subtree override используйте публичный ключ и нативный `provide` Vue:

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

## Фабрики перехватчиков

Создайте значения interceptor и скомпонуйте их core-функцией `withInterceptors(...)` до установки plugin:

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

Если фабрика захватывает учётные данные запроса, вызывайте её внутри границы запроса, создающей этот клиент.

## Реакция на изменение входных данных

Связывайте HTTP-работу с реактивным значением, которое её запускает. Один `onMounted` прочитает только исходное свойство. `watch` вместе с очисткой отменяет устаревшую работу:

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

Импортированная фабрика команды `getUser` описывает контракт эндпоинта. Компонент отвечает за отмену при изменении `id` или размонтировании.

## Границы SSR

Браузерное приложение может установить безопасный для браузера клиент. В SSR создавайте отдельный core client в каждой границе серверного запроса и предоставляйте соответствующему приложению только этот экземпляр; не разделяйте headers, cookies, tenant state или credentials между запросами.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## Владение ресурсами

Установка или unmount plugin не отменяет HTTP и не закрывает ресурсы SSE или WebSocket. Код, создающий клиент, владеет всей начатой через него работой.

- зарегистрировать очистку до или одновременно с асинхронным запуском;
- отменить запуск при завершении своей области;
- закрыть хендл или сеанс, если он вернулся уже после уничтожения владельца;
- постоянно читать `stream` или `session.receive`;
- вызвать `stream.close(...)` или `session.close(...)` для активного ресурса;
- удалить наблюдателей WebSocket.

Не открывайте WebSocket только ради слушателя состояния, оставляя его конечную входящую очередь непрочитанной: переполнение фатально завершает сеанс. Полные правила жизненного цикла приведены в разделах [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket).

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

Создаёт Vue plugin, предоставляющий переданный экземпляр клиента.

Возвращает ближайший клиент и бросает ошибку при его отсутствии.

Публичный injection key для нативных subtree providers.

## Что дальше

- [Клиент](/ru-RU/core/client) — композиция core-опций и область клиента.
- [Команды](/ru-RU/core/commands) — описания эндпоинтов и входные данные команд.
- [Перехватчики](/ru-RU/core/interceptors) — core-контракт перехватчиков.
