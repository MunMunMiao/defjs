# @defjs/vue

Thin Vue 3 adapter for `@defjs/core`. It provides Vue plugin and inject wiring so a typed defjs client can be shared through an application tree.

Supports Vue 3+.

## Package and repository setup

Install `@defjs/vue` with compatible `@defjs/core` and `vue` releases. Inside this repository, those package names resolve to the workspace source packages at `packages/vue` and `packages/core`.

Repository development uses Node 26 or newer with `pnpm@11.6.0` and `engine-strict=true`. The published package manifest supports Node 22 or newer, and CI verifies the same packed artifact on Node 22, 24, and 26.

## What this package does

`provideClient(...)` creates a Vue plugin that builds one `@defjs/core` client during app installation and provides it to the application context. `injectClient()` reads that client inside setup functions or composables. `withEndpoint` and `withInterceptors` are Vue-specific option glue for plugin setup.

This package is a thin adapter over `@defjs/core`. It does not implement a Nuxt module, a Pinia plugin, a query cache, retry policy, or application state management. Compose those pieces in your own app code by calling `client.execute(...)` from composables, stores, route handlers, or framework integrations.

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

Use the injected client inside a component or composable and handle the error-first tuple yourself:

```vue
<!-- UserCard.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { injectClient } from '@defjs/vue'
import { getUser } from './api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('loading...')

onMounted(async () => {
  const [error, user] = await client.execute(getUser({ path: { id: props.id } }))

  if (error) {
    name.value = error.message
    return
  }

  name.value = user.name
})
</script>

<template>
  <div>{{ name }}</div>
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

When browsing this repository, see `doc/plugins/vue.md` for recipes covering Nuxt server/client boundaries, application-owned header and cookie forwarding, Pinia actions, SSE and WebSocket cleanup, and SSR safety notes.

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
