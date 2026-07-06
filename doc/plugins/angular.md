---
title: Angular
description: Thin Angular adapter for @defjs/core with DI wiring and cookbook notes for mainstream app-layer integrations.
---

# @defjs/angular

`@defjs/angular` is a thin Angular dependency-injection adapter around `@defjs/core`. It creates typed defjs clients inside Angular DI with `provideClient(...)`, lets consumers read the client visible from their current Angular injection context with `injectClient()`, and provides Angular-specific option wiring for endpoint and interceptor setup.

It does not implement RxJS operators, signal state, TestBed utilities, generated mocks, retry policies, or application state management. Compose those patterns in your Angular services, facades, tests, or app-layer integrations by calling `client.execute(...)`.

## Repository workspace setup

This page currently documents source/workspace usage from this repository. `@defjs/angular` lives at `packages/angular`, and its peer dependency expects the matching `@defjs/core` workspace version from `packages/core`.

The import specifiers shown below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. The current repository examples below can use newer source/workspace `@defjs/core` APIs such as `createClient(withEndpoint(...))` and `struct.request(...)`, so do not copy these examples into an external app unless the published versions you choose explicitly support that API surface.

Current workspace/package baseline: this repository uses `Node >=26`, `pnpm@11.6.0`, and `engine-strict=true`, and `packages/angular/package.json` currently declares `engines.node >=26`. That means this source checkout and any package built from the current manifests have a Node >=26 floor. If you install a published package, follow the engine field and release notes that ship with that published version.

Angular remains a peer dependency. The current workspace package supports Angular `>=18.0.0 <=22.0.0`.

## What the adapter owns

Use `@defjs/angular` when you want Angular-owned client injection:

- `provideClient(...)` creates one `@defjs/core` client for an Angular environment provider boundary.
- `injectClient()` reads the client visible from the current Angular injection context.
- `withEndpoint` and `withInterceptors` are Angular-specific provider glue for client setup.

If you need to create a client outside Angular DI, use `createClient(...)` from `@defjs/core` directly. That is the right place for request helpers, test fixtures, and non-Angular integration code.

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

`provideClient(...)` creates the client inside Angular DI. If you omit `withEndpoint(...)`, the adapter falls back to `document.location.origin` when a browser `Document` is available.

### 3. Read the client from Angular DI

```ts
// user.component.ts
import { Component, signal } from '@angular/core'
import { injectClient } from '@defjs/angular'
import { getUser } from './api'

@Component({
  selector: 'app-user',
  template: `<button type="button" (click)="loadUser()">Load</button><p>{{ userName() }}</p>`,
})
export class UserComponent {
  private readonly client = injectClient()
  readonly userName = signal('idle')

  async loadUser() {
    const [error, user] = await this.client.execute(getUser({ path: { id: 1 } }))

    if (error) {
      this.userName.set(error.message)
      return
    }

    this.userName.set(user.name)
  }
}
```

`client.execute(...)` returns an error-first tuple for ordinary request failures. Angular components, facades, RxJS bridges, and tests are the right places to decide whether that tuple should become a thrown error, fallback UI state, or a richer domain result.

## Option helpers

`withEndpoint` and `withInterceptors` in `@defjs/angular` are provider-oriented helpers. `withInterceptors` accepts factory functions because `provideClient(...)` creates the real `@defjs/core` client through Angular DI. Angular registers those factories as `useFactory` providers when the provider/environment boundary is created, then runs them when the client is first resolved/created in that boundary. That means `inject(...)` reads Angular tokens at client creation time, and long-lived clients do not re-read request-scoped tokens for every request. For per-request values, either create a request-owned provider boundary or read mutable app-owned state inside the interceptor function that the factory returns.

```ts
// app.config.ts
import { ApplicationConfig, inject } from '@angular/core'
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { AUTH_TOKEN } from './auth.token'

export const appConfig: ApplicationConfig = {
  providers: [
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
  ],
}
```

If you are building a client outside Angular DI, use `@defjs/core` directly.

## Cookbook

### Service or facade boundary: keep transport details in one place

A service or facade is the normal boundary for converting `client.execute(...)` into the calling style your Angular app prefers. Let the service own the injected client and expose domain-focused methods. Remember that a `providedIn: 'root'` service is created from the root injector, so it keeps the root `provideClient(...)` boundary unless you provide that service inside a nested environment boundary:

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

That explicit `throw error` is an application decision. Keep it here if the rest of your app prefers exception-based control flow. If not, return the tuple or map it into a richer domain result instead.

### RxJS bridge: convert the tuple at the observable boundary

`@defjs/angular` does not provide RxJS operators. Use `defer(() => from(...))` or your own observable creation at the app layer so each subscription decides when execution starts, then convert the defjs tuple where your RxJS pipeline begins:

```ts
// user-query.ts
import { Injectable } from '@angular/core'
import { defer, from, map } from 'rxjs'
import { injectClient } from '@defjs/angular'
import { getUser } from './api'

@Injectable({ providedIn: 'root' })
export class UserQuery {
  private readonly client = injectClient()

  user$(id: number) {
    return defer(() => {
      const command = getUser({ path: { id } })
      return from(
        this.client.execute(command),
      )
    }).pipe(
      map(([error, user]) => {
        if (error) {
          throw error
        }
        return user
      }),
    )
  }
}
```

This keeps lazy execution, retry policy, sharing, and loading-state decisions in your RxJS layer instead of pretending the adapter owns them. Unsubscribing from this observable alone does not abort an already-started request.

### Signals bridge: let Angular own reactive state

`@defjs/angular` does not ship signal helpers. If your Angular app uses signals, map transport results into explicit UI state before `toSignal(...)` so request failures become data your template can render instead of template-time throws. Also keep the input reactive at runtime instead of reading `input.required(...)` during field initialization:

```ts
// user-card.component.ts
import { Component, inject, input } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { catchError, map, of, startWith, switchMap } from 'rxjs'
import { UserQuery } from './user-query'

type UserState =
  | { state: 'loading' }
  | { state: 'ready'; user: { id: number; name: string } }
  | { state: 'error'; message: string }

@Component({
  selector: 'app-user-card',
  template: `
    @switch (userState().state) {
      @case ('loading') {
        <p>Loading...</p>
      }
      @case ('error') {
        <p>{{ userState().message }}</p>
      }
      @case ('ready') {
        <p>{{ userState().user.name }}</p>
      }
    }
  `,
})
export class UserCardComponent {
  private readonly userQuery = inject(UserQuery)
  readonly id = input.required<number>()
  readonly userState = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) =>
        this.userQuery.user$(id).pipe(
          map((user): UserState => ({ state: 'ready', user })),
          startWith({ state: 'loading' } satisfies UserState),
          catchError((error: unknown) =>
            of({
              state: 'error',
              message: error instanceof Error ? error.message : 'Failed to load user',
            } satisfies UserState),
          ),
        ),
      ),
    ),
    {
      initialValue: { state: 'loading' } satisfies UserState,
    },
  )
}
```

The signal boundary belongs to Angular application code. Defjs stays the typed request executor underneath it.

### TestBed: keep Angular DI, stub transport at the boundary

The adapter does not include TestBed utilities or an exported client token. For integration-style tests, keep the real `provideClient(...)` boundary and short-circuit requests with an interceptor that returns a fake HTTP response:

```ts
// user-api.spec.ts
import { TestBed } from '@angular/core/testing'
import { createHttpInterceptor, makeResponse } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { UserApi } from './user-api'

describe(UserApi.name, () => {
  it('returns the mocked user', async () => {
    TestBed.configureTestingModule({
      providers: [
        UserApi,
        provideClient(
          withEndpoint('https://api.example.com'),
          withInterceptors(() =>
            createHttpInterceptor(async () =>
              makeResponse({
                status: 200,
                body: { id: 1, name: 'Ada' },
              }),
            ),
          ),
        ),
      ],
    })

    const api = TestBed.inject(UserApi)
    const user = await api.loadUser(1)

    expect(user).toEqual({ id: 1, name: 'Ada' })
  })
})
```

This exercises the same Angular DI/provider path as production without depending on internal tokens or package-owned testing helpers. Keep the `describe`/`it`/`expect` globals or imports aligned with whatever Angular test runner setup your workspace uses.

### Typed mock helpers: keep them application-owned

For pure unit tests above the adapter boundary, keep a narrow mock client shape in your own test utilities instead of expecting `@defjs/angular` to generate doubles for every command surface:

```ts
// test/create-mock-user-client.ts
import { getUser } from '../api'

type LoadUserResult =
  | [error: null, value: { id: number; name: string }]
  | [error: { message: string }, value: undefined]

type UserClient = {
  execute: (_command: ReturnType<typeof getUser>) => Promise<LoadUserResult>
}

export function createMockUserClient(result: LoadUserResult): UserClient {
  return {
    execute: async () => result,
  }
}
```

Keep the mock as narrow as the calling code needs. `@defjs/angular` does not generate test doubles, and it does not add a package-owned mock factory on top of `@defjs/core`.

### Multiple clients: express backend boundaries with Angular DI scopes

For multiple backends, create separate Angular environment-provider boundaries and let each boundary own its own endpoint, auth strategy, and interceptors. `provideClient(...)` returns `EnvironmentProviders`, so the straightforward places to install it are app bootstrap, route providers, or another manually created `EnvironmentInjector` boundary.

```ts
// root application boundary
export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

// nested admin route or feature boundary
export const adminProviders = [provideClient(withEndpoint('https://admin-api.example.com'))]
```

If you need a component-hosted subtree with its own client, create an `EnvironmentInjector` explicitly and render that subtree through it rather than placing `provideClient(...)` in `@Component.providers`:

```ts
import {
  Component,
  EnvironmentInjector,
  ViewContainerRef,
  createEnvironmentInjector,
  inject,
} from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

@Component({
  selector: 'admin-shell',
  template: '',
})
export class AdminShellComponent {}

@Component({
  selector: 'admin-client-boundary',
  template: '',
})
export class AdminClientBoundary {
  private readonly parentEnvironmentInjector = inject(EnvironmentInjector)
  private readonly viewContainerRef = inject(ViewContainerRef)
  private readonly adminEnvironmentInjector = createEnvironmentInjector(
    [provideClient(withEndpoint('https://admin-api.example.com'))],
    this.parentEnvironmentInjector,
  )

  ngOnInit() {
    this.viewContainerRef.createComponent(AdminShellComponent, {
      environmentInjector: this.adminEnvironmentInjector,
    })
  }

  ngOnDestroy() {
    this.adminEnvironmentInjector.destroy()
  }
}
```

This matches the current runtime behavior and package tests: nested `provideClient(...)` environment boundaries create isolated clients for consumers created inside the inner boundary. Root-scoped services still keep the root injector/client unless you provide those services inside the nested environment too.

### SSR and request-scoped auth forwarding: keep sensitive state per request

When an Angular SSR app needs request-specific headers or cookies, create the provider/interceptor boundary inside the request-owned bootstrap path rather than in a cross-request singleton. `withInterceptors(...)` factories read DI tokens when that request-owned client is first resolved/created in its boundary, not again for each request, so long-lived clients should read mutable app-owned state inside the returned interceptor function if they need changing values. Your application still decides which headers or cookies are safe to forward.

```ts
import { inject } from '@angular/core'
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { REQUEST_AUTH_HEADER } from './request-auth.token'

export const requestScopedClientProviders = [
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => {
      const authHeader = inject(REQUEST_AUTH_HEADER, { optional: true })

      return createHttpInterceptor(async (request, next) => {
        if (authHeader) {
          const headers = request.headers ?? new Headers()
          request.headers = headers
          headers.set('authorization', authHeader)
        }

        return next(request)
      })
    }),
  ),
]
```

Do not keep a client carrying user-specific auth headers in a process-wide singleton.

## API Reference

### `provideClient(...feature: EnvironmentProviders[]): EnvironmentProviders`

Creates a client and registers it in Angular DI for the current environment provider boundary.

### `withEndpoint(endpoint: string): EnvironmentProviders`

Sets the base endpoint URL for the client created by `provideClient(...)`.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registers interceptor factory functions. Angular stores them as `useFactory` providers for that environment boundary, then executes each factory once when the client is first resolved/created in that boundary, so it can read that Angular DI context before returning an interceptor.

### `injectClient(): Client`

Returns the client visible from the current Angular injection context. Nested environment boundaries can override it for consumers created inside that boundary, while `providedIn: 'root'` services keep the root client unless they are provided again inside the nested environment. Throws if no client was provided.

## Dependencies

The current package declares Angular peer dependency range `>=18.0.0 <=22.0.0`.

For exact published version pairings, check the installed package metadata for the `@defjs/angular` and `@defjs/core` releases you are using.

## What's Next

- [Core client and commands →](/core/client)
- [HTTP requests →](/core/http)
- [SSE and WebSocket transports →](/core/sse)
