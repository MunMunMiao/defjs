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
    details: Native SSE event streams with automatic reconnect and configurable event queue handling, plus WebSocket connections with reconnect, heartbeat, and queued sends. Built for real-time applications.
  - icon: ⚡
    title: Universal Runtime
    details: Works in browsers, Node.js, Bun, and Deno. No polyfills needed. Pure ESM with zero runtime dependencies for the core package.
  - icon: 🧩
    title: Framework Ready
    details: First-class integrations for Angular, Vue, and React with provideClient / injectClient / useClient patterns. OpenTelemetry plugin for server-side observability.
---

## Quick Start

This homepage quick start targets the current repository source/workspace API.

Repository workspace baseline: use Node `>=26`, `pnpm@11.6.0`, and `engine-strict=true`. That is the current floor for this source checkout and for packages built from the repository's current manifests; if you later install a published package, follow the `engines` field and release notes shipped with that published version.

Use these commands to install the workspace and typecheck the docs twoslash blocks. Ordinary fenced snippets on this page still need manual review:

```bash
pnpm install
pnpm --dir doc run typecheck
```

To experiment with the snippet, paste it into a workspace package or docs twoslash block that resolves `@defjs/core` from source. The repository root itself is not an app package that imports `@defjs/core`.

> Published package users: the API shown on this homepage may move ahead of the release you installed. Before copying `withEndpoint(...)` or `struct.request(...)` into an external app, check the installed package metadata or release notes to confirm that this API is published there.

Define a typed request and execute it:

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
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

- [Getting Started →](/guide/getting-started) — Repository source/workspace onboarding, published package caveats, and your first request
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
