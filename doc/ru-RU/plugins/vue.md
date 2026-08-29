---
title: Vue
description: Поставь плагин, provide клиент, fetch’ни пользователя и abort при reactive change.
---

# Vue

Врежь существующий клиент `@defjs/core` в Vue. Получаешь плагин, injection key и `injectClient()`. Пакет **не** создаёт клиентов, не кеширует результаты, не ретраит команды и не закрывает transport resources на unmount.

## Базовая настройка

Поставь `@defjs/core`, `@defjs/vue` и Vue 3+. ESM; Node.js 22+, когда бежишь в Node:

`bun add @defjs/core @defjs/vue vue`

Создай клиент, поставь плагин, потом fetch с abort-on-change:

```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'
import { createApp } from 'vue'
import App from './App.vue'

const client = createClient(withEndpoint('https://api.example.com'))
const app = createApp(App)

app.use(createClientPlugin(client))
app.mount('#app')
```

```vue twoslash
<script setup lang="ts">
import { defineRequest, struct } from '@defjs/core'
import { injectClient } from '@defjs/vue'
import { ref, watch } from 'vue'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('Loading...')

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: { 200: struct.object({ name: struct.string() }) },
})

watch(
  () => props.id,
  (id, _previousId, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())

    void client.execute(getUser({ path: { id } }), { signal: controller.signal }).then(([error, user]) => {
      if (controller.signal.aborted) return
      name.value = error ? 'Unable to load user.' : user.name
    })
  },
  { immediate: true },
)
</script>

<template>
  <span>{{ name }}</span>
</template>
```

`createClientPlugin(client)` provides ровно тот объект, который ты передал. Без clone, без disposal hook. Настраивай core options и interceptors при создании клиента.

`onCleanup` бежит до re-run watcher и когда он останавливается. Зарегистрируй его до старта async работы. Error-first кортеж остаётся application data.

## Inject и override

`injectClient()` читает ближайший provider `HTTP_CLIENT` и throws, когда его нет. Override subtree через Vue `provide(HTTP_CLIENT, childClient)`:

```vue twoslash
<script setup lang="ts">
import { createClient, withEndpoint } from '@defjs/core'
import { HTTP_CLIENT, injectClient } from '@defjs/vue'
import { defineComponent, h, provide } from 'vue'

const childClient = createClient(withEndpoint('https://tenant.example.com'))
const Child = defineComponent({
  setup() {
    const client = injectClient()
    return () => h('span', client === childClient ? 'Child client is provided' : 'Unexpected client')
  },
})

provide(HTTP_CLIENT, childClient)
</script>

<template>
  <Child />
</template>
```

Ближайший provider побеждает. Descendants получают `childClient`; siblings вне subtree держат app-level клиент.

## Владей HTTP-работой вне watcher

Для работы, стартованной composable или component вне watcher, используй `AbortController` + `onScopeDispose`. Abort startup и active work; проверяй signal до присвоения reactive state. Plugin или injection scope не угадывает, кто владеет командой.

Когда scope владеет клиентом, держи его request-independent для browser-wide reuse. Если он захватывает headers, cookies, users, tenants или credentials, создай его в relevant app/SSR request boundary и provide этот instance там.

## Чисти realtime scope

Закрой стрим или сессию даже когда scope исчезает mid-connect. Abort startup, закрой late-arriving handle, consume единственный iterator, await terminal promise:

```vue twoslash
<script setup lang="ts">
import { defineEventStream, struct, type EventStreamHandle } from '@defjs/core'
import { injectClient } from '@defjs/vue'
import { onScopeDispose, ref } from 'vue'

const client = injectClient()
const messages = ref<string[]>([])
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const controller = new AbortController()
let disposed = false
let stream: EventStreamHandle<string> | undefined

const stop = () => {
  disposed = true
  controller.abort()
  stream?.close('scope-disposed')
}
onScopeDispose(stop)

void (async () => {
  const [error, nextStream] = await client.execute(notifications(), { signal: controller.signal })
  if (error) return

  stream = nextStream
  if (disposed) {
    nextStream.close('scope-disposed')
    await nextStream.closed
    return
  }

  try {
    for await (const event of nextStream) {
      messages.value.push(event.data)
    }
  } finally {
    nextStream.close('scope-finished')
    await nextStream.closed
  }
})()
</script>

<template>
  <ul>
    <li v-for="message in messages" :key="message">{{ message }}</li>
  </ul>
</template>
```

WebSocket: та же последовательность — abort prep, закрой late session, consume `session.receive`, unsubscribe `onStateChange` / `onRuntimeError`, close, await `session.closed`. Держи cleanup idempotent; disposal и iterator completion могут встретиться.

## SSR scope

`createClientPlugin(client)` provides один instance одному Vue app. В браузере шарь его, когда endpoint, interceptors и captured state безопасно шарить. Во время SSR создавай и ставь отдельный клиент на запрос, когда headers, cookies, users, tenants или credentials различаются.

App unmount, удаление плагина и disposal component scope **не** abort’ят HTTP, не закрывают SSE/WebSocket, не unsubscribe’ят listeners и не dispose’ят core клиент. Владелец, который стартует работу, должен её закончить.

## Справка

Публичные exports из `@defjs/vue`:

```typescript twoslash
import { HTTP_CLIENT, createClientPlugin, injectClient } from '@defjs/vue'

type VueApi = {
  HTTP_CLIENT: typeof HTTP_CLIENT
  createClientPlugin: typeof createClientPlugin
  injectClient: typeof injectClient
}

const api: VueApi = { HTTP_CLIENT, createClientPlugin, injectClient }
void api
```

- `HTTP_CLIENT` — `InjectionKey<Client>` для native `provide` / `inject`
- `createClientPlugin(client)` — Vue `Plugin`, который provides этот клиент
- `injectClient()` — ближайший `Client`, или throws

Создавай клиентов и опции в `@defjs/core`. См. [Клиент](../core/client.md), [Команды](../core/commands.md), [Interceptors](../core/interceptors.md), [SSE](../core/sse.md) и [WebSocket](../core/web-socket.md).

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
- [Читать SSE-стрим](../recipes/consume-sse.md)
- [Открыть WebSocket-сессию](../recipes/websocket-session.md)
