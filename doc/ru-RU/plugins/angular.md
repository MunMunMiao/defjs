---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` интегрирует `@defjs/core` в систему внедрения зависимостей Angular, предоставляя `provideClient` и `injectClient`, так что перехватчики тоже могут пользоваться Angular DI.

## Установка

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

## Предоставление клиента в конфигурации приложения

Используйте `provideClient` с `withEndpoint` в `app.config.ts` для регистрации клиента.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` создаёт экземпляр `@defjs/core` `Client` и регистрирует его как инжектируемый токен `Client`. `withEndpoint` задаёт базовый URL запроса; если опущен, по умолчанию используется `document.location.origin`.

## Инъекция клиента в компонентах или сервисах

Получите экземпляр клиента через `injectClient()` в компоненте или сервисе, затем вызывайте `client.execute(command)` для выполнения запросов.

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

## Регистрация перехватчиков через Angular DI

`withInterceptors` принимает фабричные функции. Каждая фабрика вызывается через Angular's `useFactory`, поэтому может инжектировать другие Angular-токены (например, `HttpClient`, `Router`, `LOCALE_ID`).

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

Фабрики выполняются при создании клиента, и возвращённые перехватчики формируют луковичную цепочку вызовов в порядке регистрации. Используя Angular DI, можно инжектировать конфигурацию, auth-состояние или логирующие сервисы в перехватчики.

## Справка по API

### `provideClient(...features): EnvironmentProviders`

Создаёт клиент и регистрирует его как инжектируемый токен `Client`. Принимает любое количество `EnvironmentProviders` как конфигурационные фичи.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

Задаёт базовый URL запросов клиента. Если не предоставлен, по умолчанию используется `document.location.origin` текущей страницы.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

Регистрирует фабричные функции перехватчиков. Каждая фабрика выполняется через Angular `useFactory`, с доступом к контексту Angular DI. Перехватчики формируют цепочку вызовов в порядке регистрации.

### `injectClient(): Client`

Инжектирует экземпляр клиента, зарегистрированный `provideClient`. Может использоваться в компонентах, сервисах или перехватчиках.

## Зависимости

| @defjs/angular | Angular Version | @defjs/core |
| -------------- | --------------- | ----------- |
| 19.x           | 18 – 22         | ^0.4.0      |

Angular peer dependency range: `>=18.0.0 <=22.0.0`. Node runtime: `>=26`.

## Что дальше

- [Core →](/core/client) — Полное использование `defineRequest`, `defineEventStream`, `defineWebSocket`
- [SSE & WebSocket →](/core/sse) — Детали транспортов SSE и WebSocket
