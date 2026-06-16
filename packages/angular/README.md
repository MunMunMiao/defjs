# @defjs/angular

Angular wrapper for [@defjs/core](../core) — provides dependency injection helpers for using defjs clients in Angular applications.

Supports Angular 18–22.

## Installation

```bash
npm install @defjs/angular @defjs/core
# or
bun add @defjs/angular @defjs/core
```

## Quick Start

### 1. Provide a global client (recommended)

```typescript
// app.config.ts
import { provideGlobalClient, withEndpoint } from '@defjs/angular'

export const appConfig = {
  providers: [provideGlobalClient(withEndpoint('https://api.example.com'))],
}
```

This creates a `@defjs/core` client pointing at the given host and registers it as the global client via `APP_INITIALIZER`. All `defineRequest` / `defineEventStream` / `defineWebSocket` calls throughout the app will use this client automatically.

### 2. Use a standalone client (multi-API scenarios)

```typescript
// app.config.ts
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

Then inject it in your component or service:

```typescript
import { injectClient } from '@defjs/angular'
import { defineRequest, field } from '@defjs/core'

@Component({
  /* ... */
})
export class UserComponent {
  private client = injectClient()

  getUser = defineRequest('/v1/user/:id').withField({ id: field<number>().withParam() })

  async loadUser(id: number) {
    const { doRequest } = this.getUser({ client: this.client })
    const { error, body } = await doRequest({ id })
    // ...
  }
}
```

## API

### `provideGlobalClient(...features): EnvironmentProviders`

Creates a client and sets it as the global client. Runs during `APP_INITIALIZER` so it's ready before any component renders.

### `provideClient(...features): EnvironmentProviders`

Creates a client and registers it as an injectable `Client` token. Does **not** set it as the global client — use `injectClient()` to retrieve it.

### `injectClient(): Client`

Injects the client provided by `provideClient` or `provideGlobalClient`.

### `withEndpoint(endpoint: string): EnvironmentProviders`

Sets the base endpoint URL for the client. If omitted, defaults to `document.location.origin`.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registers interceptors for the client. Each function is called via Angular's `useFactory` and receives DI context.

```typescript
import { withInterceptors } from '@defjs/angular'
import { basicAuthHttpInterceptor } from '@defjs/core'

provideGlobalClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }))),
)
```

## Version Compatibility

| @defjs/angular | @defjs/core |
| -------------- | ----------- |
| 19.x           | ^0.4.0      |

## License

[MIT](../../LICENSE)
