---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` integrates `@defjs/core` into Angular's dependency injection system, providing `provideClient` and `injectClient` so interceptors can also benefit from Angular DI.

## Installation

::: code-group

```bash [npm]
npm install @defjs/angular @defjs/core
```

```bash [pnpm]
pnpm add @defjs/angular @defjs/core
```

```bash [bun]
bun add @defjs/angular @defjs/core
```

:::

## Provide Client in Application Config

Use `provideClient` with `withEndpoint` in `app.config.ts` to register the client.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` creates a `@defjs/core` `Client` instance and registers it as an injectable `Client` token. `withEndpoint` sets the base request URL; if omitted, it defaults to `document.location.origin`.

## Inject Client in Components or Services

Retrieve the client instance via `injectClient()` in a component or service, then call `client.execute(command)` to make requests.

```typescript
// user.component.ts
import { Component } from '@angular/core'
import { injectClient } from '@defjs/angular'
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

@Component({
  selector: 'app-user',
  template: `<div>{{ userName() }}</div>`,
})
export class UserComponent {
  private client = injectClient()
  userName = signal<string>('')

  async loadUser() {
    const [error, user] = await this.client.execute(getUser())
    if (!error) {
      this.userName.set(user.name)
    }
  }
}
```

```typescript
// user.service.ts
import { Injectable } from '@angular/core'
import { injectClient } from '@defjs/angular'
import { defineRequest, struct } from '@defjs/core'

const updateUser = defineRequest({
  method: 'POST',
  path: '/v1/user',
  input: struct.object({ name: struct.string() }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

@Injectable({ providedIn: 'root' })
export class UserService {
  private client = injectClient()

  async updateName(name: string) {
    const [error, user] = await this.client.execute(updateUser({ name }))
    if (error) throw error
    return user
  }
}
```

## Register Interceptors via Angular DI

`withInterceptors` accepts factory functions. Each factory is called through Angular's `useFactory`, so it can inject other Angular tokens (e.g., `HttpClient`, `Router`, `LOCALE_ID`).

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { createHttpInterceptor } from '@defjs/core'

export const appConfig: ApplicationConfig = {
  providers: [
    provideClient(
      withEndpoint('https://api.example.com'),
      withInterceptors(
        () =>
          createHttpInterceptor(async (req, next) => {
            req.headers.set('X-Request-Id', crypto.randomUUID())
            return next(req)
          }),
        () =>
          createHttpInterceptor(async (req, next) => {
            const start = performance.now()
            const res = await next(req)
            console.log(`⏱ ${req.method} ${req.url} took ${performance.now() - start}ms`)
            return res
          }),
      ),
    ),
  ],
}
```

Factories execute at client creation time, and returned interceptors form an onion call chain in registration order. Using Angular DI, you can inject configuration, auth state, or logging services into interceptors.

## API Reference

### `provideClient(...features): EnvironmentProviders`

Creates a client and registers it as an injectable `Client` token. Accepts any number of `EnvironmentProviders` as feature configurations.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

Sets the client's base request URL. If not provided, defaults to the current page's `document.location.origin`.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registers interceptor factory functions. Each factory executes via Angular `useFactory`, with access to the Angular DI context. Interceptors form a call chain in registration order.

### `injectClient(): Client`

Injects the client instance registered by `provideClient`. Can be used in components, services, or interceptors.

## Dependencies

| @defjs/angular | Angular Version | @defjs/core |
| -------------- | --------------- | ----------- |
| 19.x           | 18 – 22         | ^0.4.0      |

Angular peer dependency range: `>=18.0.0 <=22.0.0`. Node runtime: `>=26`.

## What's Next

- [Core →](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` full usage
- [SSE & WebSocket →](/core/sse) — SSE and WebSocket transport details
