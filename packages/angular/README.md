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

### 1. Provide a client

```typescript
// app.config.ts
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

This creates a `@defjs/core` client pointing at the given host and registers it as an injectable `Client` token. You can retrieve it with `injectClient()` in components or services, or set it as the global client explicitly if you prefer implicit command execution.

### 2. Use the injected client

```typescript
import { injectClient } from '@defjs/angular'
import { defineRequest, execute, struct } from '@defjs/core'

@Component({
  /* ... */
})
export class UserComponent {
  private client = injectClient()

  getUser = defineRequest({
    method: 'GET',
    output: { 200: struct.object({ name: struct.string() }) },
    path: '/v1/user',
  })

  async loadUser() {
    const [error, user] = await execute(this.getUser(), { client: this.client })
    // ...
  }
}
```

## API

### `provideClient(...features): EnvironmentProviders`

Creates a client and registers it as an injectable `Client` token. Retrieve it with `injectClient()`.

### `injectClient(): Client`

Injects the client provided by `provideClient`.

### `withEndpoint(endpoint: string): EnvironmentProviders`

Sets the base endpoint URL for the client. If omitted, defaults to `document.location.origin`.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registers interceptors for the client. Each function is called via Angular's `useFactory` and receives DI context.

```typescript
import { withInterceptors } from '@defjs/angular'
import { basicAuthHttpInterceptor } from '@defjs/core'

provideClient(
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
