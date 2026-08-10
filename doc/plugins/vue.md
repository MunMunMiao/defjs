---
title: Vue
description: Share a Defjs client through Vue injection, configure it for your API, preserve SSR request scope, and clean up transport resources.
---

# `@defjs/vue`

`@defjs/vue` is a thin injection adapter for `@defjs/core`. It exports:

- `provideClient(...)`, a Vue plugin that creates and provides a core client;
- `injectClient()`, which returns the nearest injected client;
- `HTTP_CLIENT`, the injection key used for overrides;
- adapter `withEndpoint(...)` and interceptor-factory `withInterceptors(...)` helpers.

It does not add transport behavior, caching, state management, retries, or a Nuxt module. Install it alongside `@defjs/core` and Vue, then keep those application-level concerns in your own composables, stores, and framework integrations.

## Install the Plugin

Each plugin installation creates one client:

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` accepts any `ClientOption` from `@defjs/core`, not only options re-exported or recreated by the Vue adapter:

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Options run when the plugin installs and creates the client. Installing the same plugin object into another app creates another client.

## Inject the Nearest Client

Call `injectClient()` in component `setup`, `<script setup>`, or an active composable/injection context:

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

It throws when no `HTTP_CLIENT` is available. Do not call it at arbitrary module scope.

Vue's normal nearest-provider rule applies. A component can provide an override for descendants:

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

Descendants calling `injectClient()` receive `scopedClient`; siblings outside this subtree continue to receive the app-level client.

## Interceptor Factories

The adapter's `withInterceptors(...)` accepts factories, not interceptor instances. It evaluates those factories when the client is created and appends their results in option order.

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

This differs from core `withInterceptors(...)`, which accepts already-created interceptor values. Keep server credential factories request-scoped.

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

A browser app can install one plugin client when its configuration is browser-safe and request-independent.

For SSR, do not capture request headers, cookies, user data, or tenant data in a cross-request app singleton. Create a core client inside each server request boundary and pass or provide it only within that request's render tree.

The adapter does not isolate application closures between concurrent SSR requests. It also does not decide which inbound headers or cookies are safe to forward.

A Nuxt client plugin can install the Vue adapter for browser consumers:

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

The `.client.ts` suffix makes this browser-only. It is not a server-request client and must not be used to forward SSR credentials. In a Nuxt application, test this boundary together with your actual plugins, route handlers, and hydration setup.

## Resource Ownership

Installing or unmounting a Vue provider does not abort HTTP work or close SSE and WebSocket resources. The adapter creates a client, and core clients have no `dispose()` method.

The component, composable, route, or store that starts realtime work must:

- register cleanup before or alongside asynchronous startup;
- abort startup when its scope ends;
- close a handle or session that arrives after disposal;
- continuously consume `stream` or `session.receive`;
- call `stream.close(...)` or `session.close(...)` for an active resource;
- unsubscribe WebSocket observers.

Do not open a WebSocket merely to attach a state listener while leaving its finite incoming queue unread; overflow is fatal to the session. See [SSE](../core/sse.md) and [WebSocket](../core/web-socket.md) for complete lifecycle rules.

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

## Next

- [Client](../core/client.md) covers core option composition and client scope.
- [Commands](../core/commands.md) covers endpoint definitions and command input.
- [Interceptors](../core/interceptors.md) covers the core interceptor contract.
