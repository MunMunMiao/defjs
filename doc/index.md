---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: Define once. Type-safe everywhere. HTTP, SSE, and WebSocket with runtime validation and full TypeScript inference.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: Type Safety
    details: Define request structs with struct. Get end-to-end type inference for inputs, outputs, and error branches. Runtime validation catches mismatches before they reach production.
  - icon: 🌐
    title: Multi-Transport
    details: One unified API style for HTTP requests, Server-Sent Events, and WebSocket connections. Switch transports without rewriting your application logic.
  - icon: 🧅
    title: Interceptors
    details: Per-transport onion-model interceptors for logging, authentication, retry, and cross-cutting concerns. HTTP, SSE, and WebSocket each have their own interceptor chain.
  - icon: 📡
    title: Streaming
    details: Native SSE and WebSocket support with automatic reconnect, heartbeat, message queueing, and backpressure control. Built for real-time applications.
  - icon: ⚡
    title: Universal Runtime
    details: Works in browsers, Node.js, Bun, and Deno. No polyfills needed. Pure ESM with zero runtime dependencies for the core package.
  - icon: 🧩
    title: Framework Ready
    details: First-class integrations for Angular, Vue, and React with provideClient / injectClient / useClient patterns. OpenTelemetry plugin for server-side observability.
---

## Quick Start

Install `@defjs/core` with your preferred package manager:

::: code-group

```bash [npm]
npm install @defjs/core
```

```bash [yarn]
yarn add @defjs/core
```

```bash [pnpm]
pnpm add @defjs/core
```

```bash [bun]
bun add @defjs/core
```

:::

Define a typed request and execute it in three lines:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())
if (!error) {
  console.log(user.id, user.name) // fully typed
}
```

## Framework Integrations

<div class="framework-grid">

### Angular

`@defjs/angular` provides `provideClient` and `injectClient` for Angular's dependency injection system. Interceptors can inject Angular services via factory functions.

[Learn more →](/plugins/angular)

### Vue

`@defjs/vue` provides `provideClient` as a Vue plugin and `injectClient` for the Composition API. Identical API design to the Angular package for seamless cross-framework knowledge transfer.

[Learn more →](/plugins/vue)

### React

`@defjs/react` provides `ClientProvider`, `useClient`, and option helpers for sharing one typed `@defjs/core` client across a React component tree.

[Learn more →](/plugins/react)

</div>

## What's Next

- [Getting Started →](/guide/getting-started) — Installation, CDN usage, and your first request
- [Core Concepts →](/core/client) — Client, commands, context, and error handling
- [Examples →](/guide/examples) — REST CRUD, SSE notifications, WebSocket chat, interceptor patterns

<style>
.framework-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.framework-grid > div,
.framework-grid > h3 {
  margin: 0;
}
.framework-grid h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.framework-grid p {
  margin: 0 0 0.5rem;
  color: var(--vp-c-text-2);
}
.framework-grid a {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>
