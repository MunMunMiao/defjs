---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular`는 `@defjs/core`를 Angular의 의존성 주입 시스템에 통합하여 `provideClient`와 `injectClient`를 제공해요. 인터셉터도 Angular DI를 활용할 수 있어요.

## 설치

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

## 애플리케이션 설정에서 클라이언트 제공

`app.config.ts`에서 `provideClient`와 `withEndpoint`를 사용하여 클라이언트를 등록하세요.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient`는 `@defjs/core`의 `Client` 인스턴스를 만들고 injectable `Client` 토큰으로 등록해요. `withEndpoint`는 기본 요청 URL을 설정하며 생략하면 `document.location.origin`이 기본값이에요.

## 컴포넌트 또는 서비스에서 클라이언트 주입

컴포넌트나 서비스에서 `injectClient()`로 클라이언트 인스턴스를 가져온 다음 `client.execute(command)`를 호출하여 요청을 보내세요.

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

## Angular DI를 통한 인터셉터 등록

`withInterceptors`는 팩토리 함수를 받아요. 각 팩토리는 Angular의 `useFactory`를 통해 호출되므로 다른 Angular 토큰(예: `HttpClient`, `Router`, `LOCALE_ID`)을 주입할 수 있어요.

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

팩토리는 클라이언트 생성 시점에 실행되며 반환된 인터셉터는 등록 순서로 어니언 호출 체인을 형성해요. Angular DI를 사용하면 인터셉터에 설정, 인증 상태, 로깅 서비스를 주입할 수 있어요.

## API 참조

### `provideClient(...features): EnvironmentProviders`

클라이언트를 생성하고 injectable `Client` 토큰으로 등록해요. `EnvironmentProviders` 형태의 기능 설정을 임의의 개수만큼 받아요.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

클라이언트의 기본 요청 URL을 설정해요. 제공되지 않으면 현재 페이지의 `document.location.origin`이 기본값이에요.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

인터셉터 팩토리 함수를 등록해요. 각 팩토리는 Angular `useFactory`를 통해 실행되며 Angular DI 컨텍스트에 접근할 수 있어요. 인터셉터는 등록 순서로 호출 체인을 형성해요.

### `injectClient(): Client`

`provideClient`가 등록한 클라이언트 인스턴스를 주입해요. 컴포넌트, 서비스, 인터셉터에서 사용할 수 있어요.

## 의존성

| @defjs/angular | Angular 버전 | @defjs/core |
| -------------- | ------------ | ----------- |
| 19.x           | 18 – 22      | ^0.4.0      |

Angular 피어 의존성 범위: `>=18.0.0 <=22.0.0`. Node 런타임: `>=26`.

## 다음 단계

- [코어 →](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` 전체 사용법
- [SSE & WebSocket →](/core/sse) — SSE와 WebSocket 트랜스포트 상세
