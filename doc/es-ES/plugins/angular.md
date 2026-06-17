---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` integra `@defjs/core` en el sistema de inyección de dependencias de Angular, proporcionando `provideClient` e `injectClient` para que los interceptores también puedan beneficiarse de la DI de Angular.

## Instalación

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

## Proveer el cliente en la configuración de aplicación

Usa `provideClient` con `withEndpoint` en `app.config.ts` para registrar el cliente.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` crea una instancia de `Client` de `@defjs/core` y la registra como un token `Client` inyectable. `withEndpoint` establece la URL base de petición; si se omite, por defecto es `document.location.origin`.

## Inyectar el cliente en componentes o servicios

Recupera la instancia de cliente mediante `injectClient()` en un componente o servicio, luego llama `client.execute(command)` para hacer peticiones.

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

## Registrar interceptores mediante DI de Angular

`withInterceptors` acepta funciones factory. Cada factory es llamada a través de `useFactory` de Angular, así que puede inyectar otros tokens Angular (p. ej., `HttpClient`, `Router`, `LOCALE_ID`).

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

Las factories se ejecutan en tiempo de creación del cliente, y los interceptores devueltos forman una cadena de llamada en orden de registro. Usando la DI de Angular, puedes inyectar configuración, estado de autenticación o servicios de registro en los interceptores.

## Referencia de API

### `provideClient(...features): EnvironmentProviders`

Crea un cliente y lo registra como un token `Client` inyectable. Acepta cualquier cantidad de `EnvironmentProviders` como configuraciones de feature.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

Establece la URL base de petición del cliente. Si no se proporciona, por defecto es el `document.location.origin` de la página actual.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registra funciones factory de interceptor. Cada factory se ejecuta mediante `useFactory` de Angular, con acceso al contexto DI de Angular. Los interceptores forman una cadena de llamada en orden de registro.

### `injectClient(): Client`

Inyecta la instancia de cliente registrada por `provideClient`. Puede usarse en componentes, servicios o interceptores.

## Dependencias

| @defjs/angular | Angular Version | @defjs/core |
| -------------- | --------------- | ----------- |
| 19.x           | 18 – 22         | ^0.4.0      |

Rango de peer dependency de Angular: `>=18.0.0 <=22.0.0`. Node runtime: `>=26`.

## Qué sigue

- [Core →](/core/client) — Uso completo de `defineRequest`, `defineEventStream`, `defineWebSocket`
- [SSE & WebSocket →](/core/sse) — Detalles de transporte SSE y WebSocket
