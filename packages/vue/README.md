# @defjs/vue

Thin Vue 3 adapter for `@defjs/core`. It provides Vue plugin and inject wiring so a typed defjs client can be shared through an application tree.

Supports Vue 3+.

## Repository workspace setup

This README documents source/workspace usage from this repository. `@defjs/vue` lives at `packages/vue`, and its peer dependency expects the matching workspace version of `@defjs/core` from `packages/core`.

The imports below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. Public npm does not currently provide `@defjs/vue`, and the latest standalone `@defjs/core` release available there does not match the API shown here. If you later publish compatible `@defjs/vue` and `@defjs/core` versions, install those published packages together with a compatible `vue` version in that environment instead of mixing this package with an older standalone `@defjs/core` release.

Current workspace/package baseline: this repository uses `Node >=26`, `pnpm@11.6.0`, and `engine-strict=true`, and `packages/vue/package.json` currently declares `engines.node >=26`. That means this source checkout and any package built from the current manifests have a Node >=26 floor. If you install a future published package, follow the engine field and release notes that ship with that published version.

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

const authInterceptor = createHttpInterceptor(async (request, next) => {
  const headers = request.headers ?? new Headers()
  request.headers = headers
  headers.set('authorization', 'Bearer token')
  return next(request)
})

const loggingInterceptor = createHttpInterceptor(async (request, next) => {
  const target = request.baseEndpoint
    ? new URL(`${request.endpoint}${request.queryString ? `?${request.queryString}` : ''}`, request.baseEndpoint).toString()
    : `${request.endpoint}${request.queryString ? `?${request.queryString}` : ''}`

  console.log(request.method, target)
  return next(request)
})

const app = createApp(App)

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(
      () => authInterceptor,
      () => loggingInterceptor,
    ),
  ),
)

app.mount('#app')
```

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
