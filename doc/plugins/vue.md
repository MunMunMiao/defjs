---
title: Vue
description: Share a Defjs client through Vue injection, configure it for your API, preserve SSR request scope, and clean up transport resources.
---

# `@defjs/vue`

This package is a thin injection adapter for `@defjs/core`. `createClientPlugin(client)` provides an application-created client, `injectClient()` returns the nearest instance, and `HTTP_CLIENT` supports native subtree overrides. It adds no client factory, cache, retry policy, or resource lifecycle.

## Install the Plugin

Create and configure the client with `@defjs/core`, then install a plugin for that exact instance:

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

The plugin only provides the supplied instance. Installing it does not create, clone, replace, or dispose the client.

## Inject the Nearest Client

Call `injectClient()` in component `setup`, `<script setup>`, or an active injection context. It throws when no `HTTP_CLIENT` is available. Vue's normal nearest-provider rule applies.

Use the public key with Vue's native `provide` for a subtree override:

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

## Interceptor Factories

Create interceptor values and compose them with core `withInterceptors(...)` before installing the plugin:

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

If an interceptor factory captures request-specific credentials, call it inside the request boundary that creates that client.

## React to Input Changes

Tie HTTP work to the reactive value that starts it. `onMounted` alone only reads the initial prop. `watch` plus cleanup cancels superseded work:

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

The imported `getUser` command builder owns the endpoint contract. This component owns cancellation when `id` changes or the component unmounts.

## Query and GraphQL Boundaries

When TanStack Query owns caching, retry, stale-result suppression, and component cleanup, put the Defjs command inside its `queryFn`, keep the key reactive, forward the supplied signal, and convert the tuple error to a throw at that boundary:

```vue
<script setup lang="ts">
import { toRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { injectClient } from '@defjs/vue'
import { getUser } from './api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const id = toRef(props, 'id')

const query = useQuery({
  queryKey: ['user', id],
  queryFn: async ({ signal }) => {
    const [error, user] = await client.execute(getUser({ path: { id: id.value } }), { signal })
    if (error) {
      throw error
    }
    return user
  },
})
</script>

<template>
  <p>{{ query.data.value?.name ?? (query.error.value ? 'Unable to load user.' : 'Loading...') }}</p>
</template>
```

Do not wrap the same request in a second watcher; let one lifecycle owner control cancellation and stale results. `@defjs/vue` also does not provide GraphQL composables, a normalized GraphQL cache, generated operation types, or the GraphQL WebSocket protocol. A GraphQL-first application should compose a dedicated GraphQL client and, for subscriptions, follow the [GraphQL WebSocket boundary](../core/web-socket.md#graphql-over-websocket).

## SSR Boundaries

A browser app can install one browser-safe client. For SSR, create a separate core client inside each server request boundary and provide only that instance to the corresponding app; do not share request headers, cookies, tenant state, or credentials across requests.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## Resource Ownership

Installing or unmounting the plugin does not abort HTTP work or close SSE and WebSocket resources. The caller that creates the client owns all work started through it.

- register cleanup before or alongside asynchronous startup;
- abort startup when its scope ends;
- close a handle or session that arrives after disposal;
- continuously consume `stream` or `session.receive`;
- call `stream.close(...)` or `session.close(...)` for an active resource;
- unsubscribe WebSocket observers.

Do not open a WebSocket merely to attach a state listener while leaving its finite incoming queue unread; overflow is fatal to the session. See [SSE](../core/sse.md) and [WebSocket](../core/web-socket.md) for complete lifecycle rules.

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

Creates a Vue plugin that provides the supplied client instance.

Returns the nearest provided client and throws when none exists.

Public injection key for native subtree providers.

## Next

- [Client](../core/client.md) covers core option composition and client scope.
- [Commands](../core/commands.md) covers endpoint definitions and command input.
- [Interceptors](../core/interceptors.md) covers the core interceptor contract.
