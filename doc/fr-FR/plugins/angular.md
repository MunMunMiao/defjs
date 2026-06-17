---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` intègre `@defjs/core` dans le système d'injection de dépendances d'Angular, fournissant `provideClient` et `injectClient` pour que les intercepteurs puissent aussi bénéficier de l'injection de dépendances Angular.

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

## Fournir le client dans la configuration applicative

Utilise `provideClient` avec `withEndpoint` dans `app.config.ts` pour enregistrer le client.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` crée une instance `Client` de `@defjs/core` et l'enregistre comme un token `Client` injectable. `withEndpoint` définit l'URL de base de requête ; si omis, elle vaut par défaut `document.location.origin`.

## Injecter le client dans les composants ou services

Récupère l'instance du client via `injectClient()` dans un composant ou un service, puis appelle `client.execute(command)` pour faire des requêtes.

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

## Enregistrer des intercepteurs via l'injection de dépendances Angular

`withInterceptors` accepte des fonctions factory. Chaque factory est appelée via le `useFactory` d'Angular, donc elle peut injecter d'autres tokens Angular (ex. `HttpClient`, `Router`, `LOCALE_ID`).

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

Les factories s'exécutent au moment de la création du client, et les intercepteurs retournés forment une chaîne d'appels en oignon dans l'ordre d'enregistrement. Grâce à l'injection de dépendances Angular, tu peux injecter de la configuration, de l'état d'authentification ou des services de journalisation dans les intercepteurs.

## Référence API

### `provideClient(...features): EnvironmentProviders`

Crée un client et l'enregistre comme un token `Client` injectable. Accepte un nombre quelconque de `EnvironmentProviders` comme configurations de fonctionnalités.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

Définit l'URL de base de requête du client. Si non fourni, vaut par défaut `document.location.origin` de la page courante.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Enregistre des fonctions factory d'intercepteurs. Chaque factory s'exécute via le `useFactory` d'Angular, avec accès au contexte d'injection de dépendances Angular. Les intercepteurs forment une chaîne d'appels dans l'ordre d'enregistrement.

### `injectClient(): Client`

Injecte l'instance de client enregistrée par `provideClient`. Peut être utilisé dans les composants, services ou intercepteurs.

## Dépendances

| @defjs/angular | Angular Version | @defjs/core |
| -------------- | --------------- | ----------- |
| 19.x           | 18 – 22         | ^0.4.0      |

Intervalle de peer dependency Angular : `>=18.0.0 <=22.0.0`. Runtime Node : `>=26`.

## Prochaines étapes

- [Core →](/core/client) — Usage complet de `defineRequest`, `defineEventStream`, `defineWebSocket`
- [SSE & WebSocket →](/core/sse) — Détails des transports SSE et WebSocket
