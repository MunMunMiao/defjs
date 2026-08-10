# @defjs/vue

Thin Vue 3 adapter for `@defjs/core`. It provides Vue plugin and inject wiring so a typed defjs client can be shared through an application tree.

Supports Vue 3+.

## Install

Install `@defjs/vue` with compatible `@defjs/core` and Vue releases:

```sh
npm install @defjs/core @defjs/vue vue
```

The package is ESM and requires Node.js 22 or newer when run in Node.

## What this package does

`provideClient(...)` creates a Vue plugin that builds one `@defjs/core` client during app installation and provides it to the application context. `injectClient()` reads that client inside setup functions or composables. `withEndpoint` and `withInterceptors` are Vue-specific option glue for plugin setup.

This package is a thin adapter over `@defjs/core`. It does not implement a Nuxt module, a Pinia plugin, a query cache, retry policy, GraphQL client or protocol handling, or application state management. Compose those pieces in your own app code by calling `client.execute(...)` from composables, stores, route handlers, or framework integrations.

## Quick Start

Define requests in a shared module with `@defjs/core`:

```ts
// api.ts
import { defineRequest, struct } from '@defjs/core'

export const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
    {
      status: 404,
      body: struct.object({
        message: struct.string(),
      }),
    },
  ] as const,
})
```

Provide the client at application entry:

```ts
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

Use the injected client inside a component or composable. Tie work to the reactive input that starts it, abort superseded requests, and ignore completion after cleanup:

```vue
<!-- UserCard.vue -->
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
          errorMessage.value = error.message
          return
        }

        errorMessage.value = ''
        name.value = user.name
      })
      .catch((error) => {
        if (current) {
          errorMessage.value = error instanceof Error ? error.message : String(error)
        }
      })
  },
  { immediate: true },
)
</script>

<template>
  <div>{{ errorMessage || name }}</div>
</template>
```

If you need interceptors, withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

```ts
import { createApp } from 'vue'
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import App from './App.vue'

declare const getAccessToken: () => string | null

function authInterceptor() {
  return createHttpInterceptor((request, next) => {
    const token = getAccessToken()
    if (!token) {
      return next(request)
    }

    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return next({ ...request, headers })
  })
}

function loggingInterceptor() {
  return createHttpInterceptor((request, next) => {
    console.log(request.method, request.endpoint)
    return next(request)
  })
}

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com'), withInterceptors(authInterceptor, loggingInterceptor)))

app.mount('#app')
```

The application owns token retrieval and storage. Keep default logs bounded: raw query strings, headers, bodies, and transport errors can contain credentials or sensitive data.

## Cookbook

See the bundled [Vue guide](docs/plugins/vue.md) for reactive request cleanup, request-scoped SSR boundaries, TanStack Query composition, and SSE/WebSocket ownership.

## API

### `provideClient(...feature: ClientOption[]): Plugin`

Creates a Vue plugin that builds a client during installation and provides it to the application context.

### `injectClient(): Client`

Returns the client provided by the nearest `provideClient(...)` installation. Throws if no client was provided.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client created by `provideClient(...)`.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptor factories evaluated when the plugin creates the client. withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>` used by the package's internal `provide` / `inject` wiring.

## Notes

- `provideClient(...)` creates the client when the plugin installs, not on every component render.
- For SSR or server routes, create request-specific clients at the application layer when forwarding sensitive headers or cookies.
- `@defjs/vue` does not change the request, command, interceptor, or error model from `@defjs/core`.

## License

MIT License.
