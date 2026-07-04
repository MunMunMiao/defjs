# @defjs/angular

Thin Angular DI adapter for `@defjs/core`. It provides `provideClient(...)`, `injectClient()`, and Angular-specific option wiring so a typed defjs client can be shared through Angular's dependency injection system.

Supports Angular 18–22.

## Versioning and source-checkout notes

The examples below assume `@defjs/angular` and `@defjs/core` expose matching APIs. In this repository checkout, the package imports resolve to workspace source packages. In an external app, they resolve to the published versions you installed.

Public npm currently ships `@defjs/angular@18.0.7` and `@defjs/core@0.3.3`. The source examples shown here can move ahead of those published releases, especially when an example uses newer `@defjs/core` APIs such as `createClient(withEndpoint(...))` and `struct.request(...)`. Before copying a snippet into another app, check the package metadata, README, and release notes for the exact `@defjs/angular` and `@defjs/core` versions you installed and confirm that those APIs are present.

This repository currently uses `Node >=26`, `pnpm@11.6.0`, and `engine-strict=true` for source development, and the package manifest declares `engines.node >=26`. Treat that as source-checkout guidance unless the published package metadata for your installed release says otherwise.

Angular itself remains a peer dependency. Check the peer dependency range on the release you install; the current package manifest declares `>=18.0.0 <=22.0.0`.

## What this package does

Use `@defjs/angular` when you want Angular-owned client injection:

- `provideClient(...)` creates one `@defjs/core` client for an Angular environment provider boundary.
- `injectClient()` reads the client visible from the current Angular injection context inside components, services, or other DI-aware code.
- `withEndpoint` and `withInterceptors` are Angular-specific provider glue for client setup.

This package is a thin adapter over `@defjs/core`. It does not implement RxJS operators, signal state, TestBed utilities, generated mocks, retry policies, or application state management. Compose those patterns in your own Angular services, facades, tests, or app-layer integrations by calling `client.execute(...)`.

## Quick Start

These snippets target this repository workspace checkout or a future published release whose README or package metadata explicitly includes the same API surface. If you install from npm, verify your exact `@defjs/angular` and `@defjs/core` release metadata before using snippets that rely on `struct.request(...)` or other newer source examples. Do not assume the current public npm releases support every snippet on this page.

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

### 2. Provide one client at the Angular boundary

```ts
// app.config.ts
import type { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient(...)` creates the `@defjs/core` client inside Angular DI. If you omit `withEndpoint(...)`, the adapter falls back to `document.location.origin` when a browser `Document` is available.

### 3. Read the client in a service or facade

```ts
// user-api.ts
import { Injectable } from '@angular/core'
import { injectClient } from '@defjs/angular'
import { getUser } from './api'

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly client = injectClient()

  async loadUser(id: number) {
    const [error, user] = await this.client.execute(getUser({ path: { id } }))
    if (error) {
      throw error
    }
    return user
  }
}
```

`client.execute(...)` returns an error-first tuple for ordinary request failures. Services, facades, RxJS operators, and tests are the right places to decide whether your app should throw, return fallback data, or map that tuple into UI state. If a service is `providedIn: 'root'`, it is created from the root injector and keeps the root `provideClient(...)` boundary unless you provide that service inside a nested environment boundary.

## Option helpers

`withEndpoint` and `withInterceptors` in `@defjs/angular` are provider-oriented helpers. `withInterceptors` accepts factory functions because `provideClient(...)` creates the real `@defjs/core` client through Angular DI. Angular registers those factories as `useFactory` providers when the provider/environment boundary is created, then runs them when the client is first resolved/created in that boundary. That means `inject(...)` reads Angular tokens at client creation time, and long-lived clients do not re-read request-scoped tokens for every request. For per-request values, either create the client inside a request-owned provider boundary or read mutable app-owned state inside the interceptor function that the factory returns.

```ts
import { inject } from '@angular/core'
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { AUTH_TOKEN } from './auth.token'

export const appProviders = [
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => {
      const authToken = inject(AUTH_TOKEN, { optional: true })

      return createHttpInterceptor(async (request, next) => {
        if (authToken) {
          const headers = request.headers ?? new Headers()
          request.headers = headers
          headers.set('authorization', `Bearer ${authToken}`)
        }

        return next(request)
      })
    }),
  ),
]
```

If you are building a client outside Angular DI, use `createClient(withEndpoint(...))` from `@defjs/core` directly.

## Cookbook

Keep this README focused on package boundaries and setup. For longer recipes covering service facades, RxJS bridges, Angular signals interop, TestBed guidance, application-owned typed mocks, multi-client provider boundaries, and request-scoped auth notes, see the Angular plugin guide in the source repository documentation (`doc/plugins/angular.md`).

## API

### `provideClient(...feature: EnvironmentProviders[]): EnvironmentProviders`

Creates a client and registers it in Angular DI for the current environment provider boundary.

### `injectClient(): Client`

Returns the client visible from the current Angular injection context. Nested environment boundaries can override it for consumers created inside that boundary, while `providedIn: 'root'` services keep the root client unless they are provided again inside the nested environment. Throws if no client was provided.

### `withEndpoint(endpoint: string): EnvironmentProviders`

Sets the base endpoint URL for the client created by `provideClient(...)`.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registers interceptor factory functions. Angular stores them as `useFactory` providers for that environment boundary, then executes each factory once when the client is first resolved/created in that boundary, with access to that Angular DI context.

## Notes

- Nested `provideClient(...)` environment boundaries create isolated clients for consumers created inside that boundary. Root-scoped services still keep the root injector/client unless you provide those services inside the nested environment too.
- For SSR or request-scoped auth forwarding, keep sensitive headers or cookies in the request-owned provider/interceptor boundary rather than a cross-request singleton.
- `@defjs/angular` does not change the request, command, interceptor, or error model from `@defjs/core`.

## License

MIT License.
