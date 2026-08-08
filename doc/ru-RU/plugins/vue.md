---
title: Vue
description: Передавайте клиент Defjs через provide/inject Vue, настраивайте его для своего API, сохраняйте scope SSR-запроса и закрывайте ресурсы транспорта.
---

# `@defjs/vue`

`@defjs/vue` — тонкий адаптер механизма provide/inject Vue для `@defjs/core`. Он экспортирует:

- `provideClient(...)` — Vue-плагин, который создаёт и предоставляет core-клиент;
- `injectClient()` — функцию, возвращающую ближайший внедрённый клиент;
- `HTTP_CLIENT` — ключ внедрения для переопределений;
- адаптерные функции `withEndpoint(...)` и `withInterceptors(...)`, последняя принимает фабрики перехватчиков.

Адаптер не добавляет поведение транспортов, кэширование, управление состоянием, повторы или модуль Nuxt. Установите его вместе с `@defjs/core` и Vue, а эти обязанности оставьте в composable, store и интеграциях своего приложения.

## Установка плагина

Каждая установка плагина создаёт один клиент:

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` принимает любые `ClientOption` из `@defjs/core`, а не только опции, которые адаптер Vue экспортирует или создаёт заново:

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Опции выполняются при установке плагина и создании клиента. Установка того же объекта плагина в другое приложение создаёт другой клиент.

## Внедрение ближайшего клиента

Вызывайте `injectClient()` в `setup` компонента, в `<script setup>` или в активном контексте composable либо внедрения зависимостей:

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

Если `HTTP_CLIENT` недоступен, функция выбрасывает ошибку. Не вызывайте её в произвольной области модуля.

Действует обычное правило ближайшего провайдера Vue. Компонент может предоставить переопределение потомкам:

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

Потомки с `injectClient()` получат `scopedClient`, а соседние компоненты вне этого поддерева продолжат получать клиент приложения.

## Фабрики перехватчиков

Адаптерный `withInterceptors(...)` принимает фабрики, а не готовые перехватчики. Он вызывает их при создании клиента и добавляет результаты в порядке опций.

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

Это отличается от core `withInterceptors(...)`, который принимает уже созданные перехватчики. На сервере держите фабрики с учётными данными в области запроса.

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

Браузерное приложение может установить один клиент через плагин, если его конфигурация безопасна для браузера и не зависит от запроса.

При SSR не захватывайте заголовки запроса, cookie, данные пользователя или арендатора в общем экземпляре приложения между запросами. Создавайте core-клиент внутри границы каждого серверного запроса и передавайте или предоставляйте его только дереву рендера этого запроса.

Адаптер не изолирует замыкания приложения между параллельными SSR-запросами и не решает, какие входящие заголовки или cookie безопасно пересылать дальше.

Клиентский плагин Nuxt может установить Vue-адаптер для браузерного кода:

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

Суффикс `.client.ts` означает, что файл выполняется только в браузере. Это не клиент серверного запроса, и через него нельзя пересылать учётные данные SSR. В приложении Nuxt тестируйте эту границу вместе с реальными plugin, route handler и настройками hydration.

## Владение ресурсами

Установка или размонтирование Vue-провайдера не отменяет HTTP-работу и не закрывает ресурсы SSE и WebSocket. Адаптер создаёт клиент, а у core-клиента нет метода `dispose()`.

Компонент, composable, маршрут или хранилище, которые запускают работу с транспортом реального времени, должны:

- зарегистрировать очистку до или одновременно с асинхронным запуском;
- отменить запуск при завершении своей области;
- закрыть хендл или сеанс, если он вернулся уже после уничтожения владельца;
- постоянно читать `stream` или `session.receive`;
- вызвать `stream.close(...)` или `session.close(...)` для активного ресурса;
- удалить наблюдателей WebSocket.

Не открывайте WebSocket только ради слушателя состояния, оставляя его неограниченную входящую очередь непрочитанной. Полные правила жизненного цикла приведены в разделах [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket).

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

## Что дальше

- [Клиент](/ru-RU/core/client) — композиция core-опций и область клиента.
- [Команды](/ru-RU/core/commands) — описания эндпоинтов и входные данные команд.
- [Перехватчики](/ru-RU/core/interceptors) — core-контракт перехватчиков.
