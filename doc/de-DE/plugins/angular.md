---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` integriert `@defjs/core` in Angulars Dependency-Injection-System, stellt `provideClient` und `injectClient` bereit, damit Interceptors ebenfalls von Angular DI profitieren können.

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

## Client in Application-Config bereitstellen

Verwende `provideClient` mit `withEndpoint` in `app.config.ts`, um den Client zu registrieren.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` erstellt eine `@defjs/core`-`Client`-Instanz und registriert sie als injectable `Client`-Token. `withEndpoint` setzt die Basis-Request-URL; falls weggelassen, defaultet sie auf `document.location.origin`.

## Client in Komponenten oder Services injizieren

Hole die Client-Instanz über `injectClient()` in einer Komponente oder einem Service, dann rufe `client.execute(command)` auf, um Requests zu machen.

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

## Interceptors über Angular DI registrieren

`withInterceptors` akzeptiert Factory-Funktionen. Jede Factory wird durch Angulars `useFactory` aufgerufen, sodass sie andere Angular-Tokens injizieren kann (z. B. `HttpClient`, `Router`, `LOCALE_ID`).

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

Factories werden zur Client-Erstellungszeit ausgeführt, und zurückgegebene Interceptors formen eine Zwiebel-Call-Chain in Registrierungsreihenfolge. Über Angular DI kannst du Konfiguration, Auth-Status oder Logging-Services in Interceptors injizieren.

## API-Referenz

### `provideClient(...features): EnvironmentProviders`

Erstellt einen Client und registriert ihn als injectable `Client`-Token. Akzeptiert beliebig viele `EnvironmentProviders` als Feature-Konfigurationen.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

Setzt die Basis-Request-URL des Clients. Falls nicht angegeben, defaultet auf die aktuelle Seite `document.location.origin`.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Registriert Interceptor-Factory-Funktionen. Jede Factory wird über Angular `useFactory` ausgeführt, mit Zugriff auf den Angular-DI-Context. Interceptors formen eine Call-Chain in Registrierungsreihenfolge.

### `injectClient(): Client`

Injiziert die von `provideClient` registrierte Client-Instanz. Kann in Komponenten, Services oder Interceptors verwendet werden.

## Abhängigkeiten

| @defjs/angular | Angular-Version | @defjs/core |
| -------------- | --------------- | ----------- |
| 19.x           | 18 – 22         | ^0.4.0      |

Angular-Peer-Dependency-Range: `>=18.0.0 <=22.0.0`. Node-Laufzeit: `>=26`.

## Wie geht es weiter

- [Core →](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` vollständige Nutzung
- [SSE & WebSocket →](/core/sse) — SSE- und WebSocket-Transport-Details
