---
title: Vue
description: Thin Vue adapter for @defjs/core with provide/inject wiring and cookbook notes for mainstream app-layer integrations.
---

# @defjs/vue

`@defjs/vue` is a thin adapter over `@defjs/core`. It provides app-level client injection with `provideClient(...)` and `injectClient()`, so Vue components and composables can share one typed defjs client.

It does not implement a Nuxt module, a Pinia plugin, a query cache, retry policy, or application state management. Use those patterns at the application layer by calling `client.execute(...)` from your own composables, stores, route handlers, or framework plugins.

## Repository workspace setup

This page currently documents source/workspace usage from this repository. `@defjs/vue` lives at `packages/vue`, and its peer dependency expects the matching `@defjs/core` workspace version from `packages/core`.

The import specifiers shown below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. Public npm does not currently provide `@defjs/vue`, and the latest standalone `@defjs/core` release available there does not match the API shown here. If you later publish compatible `@defjs/vue` and `@defjs/core` versions, install those published versions together in that environment instead of mixing this package with an older standalone `@defjs/core` release.

Current workspace/package baseline: this repository uses `Node >=26`, `pnpm@11.6.0`, and `engine-strict=true`, and `packages/vue/package.json` currently declares `engines.node >=26`. That means this source checkout and any package built from the current manifests have a Node >=26 floor. If you install a future published package, follow the engine field and release notes that ship with that published version.

Vue remains a peer dependency. `@defjs/vue` supports Vue 3 and newer.

## What the adapter owns

Use `@defjs/vue` when you want Vue-owned client injection:

- `provideClient(...)` builds one `@defjs/core` client during plugin installation.
- `injectClient()` reads that client inside component setup or composables.
- `withEndpoint` and `withInterceptors` are Vue-specific client option glue for plugin setup.

If you need to create a client outside Vue app installation, use `createClient(...)` from `@defjs/core` directly. That is the right place for SSR request helpers, route handlers, and non-Vue integration code.

## Quick Start

### 1. Define requests in a shared module

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

### 2. Provide one client at application entry

```ts
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

### 3. Inject the client in setup code

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

If `injectClient()` runs before `app.use(provideClient(...))`, it throws immediately so the missing provider is visible during development.

## Option helpers

`withEndpoint` and `withInterceptors` in `@defjs/vue` are plugin-oriented helpers. withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

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

const app = createApp(App)

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)

app.mount('#app')
```

If you are building a client outside Vue app installation, use `@defjs/core` directly:

```ts
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (request, next) => {
      const headers = request.headers ?? new Headers()
      request.headers = headers
      headers.set('authorization', 'Bearer token')
      return next(request)
    }),
  ),
)
```

## Cookbook

### Nuxt client plugin: provide a browser client explicitly

For browser-side app usage in Nuxt, install the Vue adapter from a Nuxt plugin and let it create the browser client there:

```ts
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

### Nuxt server routes and SSR: keep sensitive forwarding request-scoped

When you need to forward request-specific headers or cookies during SSR or inside server routes, create a request-scoped client with `@defjs/core` in that request boundary. Do not store a client carrying sensitive request headers in a cross-request singleton.

```ts
// server/lib/create-server-client.ts
import { getCookie, getHeader, getRequestHeaders } from 'h3'
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

export function createServerClient(event: Parameters<typeof getRequestHeaders>[0]) {
  const requestId = getHeader(event, 'x-request-id')
  const reviewedCookieNames = ['session', 'csrf-token'] as const
  const serializeForwardedCookie = (name: (typeof reviewedCookieNames)[number], value: string) => `${name}=${encodeURIComponent(value)}`
  const reviewedCookieHeader = reviewedCookieNames
    .flatMap((name) => {
      const value = getCookie(event, name)
      return value ? [serializeForwardedCookie(name, value)] : []
    })
    .join('; ')

  return createClient(
    withEndpoint(useRuntimeConfig(event).apiBase),
    withInterceptors(
      createHttpInterceptor(async (request, next) => {
        if (requestId || reviewedCookieHeader) {
          const forwardedHeaders = request.headers ?? new Headers()
          request.headers = forwardedHeaders

          if (requestId) {
            forwardedHeaders.set('x-request-id', requestId)
          }

          if (reviewedCookieHeader) {
            forwardedHeaders.set('cookie', reviewedCookieHeader)
          }
        }

        return next(request)
      }),
    ),
  )
}
```

Forward only the headers and cookies your application has reviewed. Build forwarded cookies from an explicit allowlist your app owns instead of passing through the raw incoming `cookie` header. The Vue adapter does not decide what is safe to forward.

### Pinia actions: keep state ownership in Pinia

Pinia can own loading state, retries, and store lifecycle. Defjs stays the typed transport layer.

```ts
// stores/user.ts
import { defineStore } from 'pinia'
import { injectClient } from '@defjs/vue'
import { getUser } from '../api'

export const useUserStore = defineStore('user', () => {
  const client = injectClient()

  async function loadUser(id: number) {
    const [error, user] = await client.execute(getUser({ path: { id } }))
    if (error) {
      throw error
    }
    return user
  }

  return { loadUser }
})
```

That explicit `throw error` is the integration boundary when your store wants exception-based control flow.

### SSE and WebSocket return shapes: read fields inside setup-managed async flows

When you read SSE or WebSocket results from a Vue component or composable, put the async work inside `onMounted(async () => { ... })` or another explicit `async` function. The examples below show the current core return shapes without relying on top-level `await` in a plain `ts` snippet.

SSE commands return `[error, stream, open]`. Each streamed item is an event object with top-level `event`, `data`, and optional `id` / `retry` fields; in the loop below the variable is named `event`, so the application payload is read as `event.data`.

```ts
// use-notifications.ts
import { onBeforeUnmount, onMounted } from 'vue'
import { defineEventStream, struct } from '@defjs/core'
import { injectClient } from '@defjs/vue'

const notifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
  },
})

export function useNotifications() {
  const client = injectClient()
  const abort = new AbortController()
  let closeStream = () => {
    abort.abort()
  }

  onBeforeUnmount(() => {
    closeStream()
  })

  onMounted(async () => {
    const [streamError, stream] = await client.execute(notifications(), {
      signal: abort.signal,
    })

    if (abort.signal.aborted) {
      return
    }

    if (streamError || !stream) {
      return
    }

    closeStream = () => {
      abort.abort()
      stream.close('component-unmounted')
    }

    try {
      for await (const event of stream) {
        if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
          console.log(event.data.text)
        }
      }
    } catch (error) {
      const closeInfo = await stream.closed

      if (abort.signal.aborted || closeInfo.code === 'aborted') {
        return
      }

      console.error('notification stream failed', error)
    }
  })
}
```

WebSocket commands return `[error, session, connection]`. Incoming messages put `type` at the top level, and the payload fields are flattened onto the message object rather than nested under `message`.

```ts
// use-chat-session.ts
import { onBeforeUnmount, onMounted } from 'vue'
import { defineWebSocket, struct } from '@defjs/core'
import { injectClient } from '@defjs/vue'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})

export function useChatSession() {
  const client = injectClient()
  let disposed = false
  let closeSession = () => {}
  let unsubscribeRuntimeError = () => {}

  onBeforeUnmount(() => {
    disposed = true
    unsubscribeRuntimeError()
    closeSession()
  })

  onMounted(async () => {
    const [socketError, session] = await client.execute(chat())

    if (socketError || !session) {
      return
    }

    if (disposed) {
      session.close(1000, 'component-unmounted')
      return
    }

    unsubscribeRuntimeError = session.onRuntimeError((error) => {
      if (!disposed) {
        console.error('chat session runtime error', error)
      }
    })

    closeSession = () => {
      unsubscribeRuntimeError()
      session.close(1000, 'component-unmounted')
    }

    session.send({ type: 'send', text: 'Hello' })

    try {
      for await (const msg of session.receive) {
        if (msg.type === 'message') {
          console.log(msg.user, msg.text)
        }
      }
    } finally {
      unsubscribeRuntimeError()
      const closeInfo = await session.closed

      if (!disposed && closeInfo.code !== 1000) {
        console.warn('chat session closed', closeInfo)
      }
    }
  })
}
```

### WebSocket cleanup: close resources when their owner goes away

Treat WebSocket sessions as resources owned by the component, route, or store that opened them. Register cleanup before or around async connection setup, and if unmount happens during the handshake, close the late-arriving session immediately so long-lived connections do not outlive the UI that needs them.

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { injectClient } from '@defjs/vue'
import { openChat } from './chat-api'

const client = injectClient()
let disposed = false
let closeSession = () => {}
let unsubscribeRuntimeError = () => {}

onBeforeUnmount(() => {
  disposed = true
  unsubscribeRuntimeError()
  closeSession()
})

onMounted(async () => {
  const [error, session] = await client.execute(openChat({ path: { roomId: 'lobby' } }))

  if (error || !session) {
    return
  }

  if (disposed) {
    session.close(1000, 'component-unmounted')
    return
  }

  unsubscribeRuntimeError = session.onRuntimeError((runtimeError) => {
    if (!disposed) {
      console.error('chat runtime error', runtimeError)
    }
  })

  closeSession = () => {
    unsubscribeRuntimeError()
    session.close(1000, 'component-unmounted')
  }

  void session.closed.then((closeInfo) => {
    unsubscribeRuntimeError()

    if (!disposed && closeInfo.code !== 1000) {
      console.warn('chat closed unexpectedly', closeInfo)
    }
  })
})
</script>
```

For SSE handles, call `stream.close(reason)` and await `stream.closed` if your UI needs the final close result.

### SSR safety: avoid cross-request client singletons for user-specific state

A module-level singleton browser client is fine when it only carries browser-safe configuration such as a public endpoint. A server-side singleton that captures per-request auth headers, cookies, or tenant context is not safe for SSR. Build those clients inside the request boundary and pass only the data that particular request is allowed to use.

## API Reference

### `provideClient(...feature: ClientOption[]): Plugin`

Creates a Vue plugin. During installation it builds a client and provides it to the application context.

### `injectClient(): Client`

Returns the client provided by `provideClient(...)`. Throws if no client was provided.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client created by `provideClient(...)`.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptor factories for the client created by `provideClient(...)`. withInterceptors(...) in this adapter accepts factory functions because the provider/plugin creates the real @defjs/core client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's withInterceptors(...) composition model.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>` used by the adapter's internal `provide` / `inject` wiring.

## Notes

- The adapter does not change the request, command, interceptor, or error model from `@defjs/core`.
- `provideClient(...)` creates the client when the plugin installs, not on every component render.
- For transport details, see [Client →](/core/client), [SSE →](/core/sse), and [WebSocket →](/core/web-socket).

## What's Next

- [Client →](/core/client) — Client creation and execution model
- [Commands →](/core/commands) — HTTP, SSE, and WebSocket command definitions
- [Interceptors →](/core/interceptors) — Core interceptor registration and transport chains
