---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` 將 `@defjs/core` 整合進 Angular 的相依注入系統，提供 `provideClient` 與 `injectClient`，讓攔截器也能受益於 Angular DI。

## 安裝

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

## 在應用程式設定中提供用戶端

在 `app.config.ts` 中使用 `provideClient` 搭配 `withEndpoint` 註冊用戶端。

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` 建立 `@defjs/core` 的 `Client` 實例，並將其註冊為可注入的 `Client` 權杖。`withEndpoint` 設定基礎請求 URL；若省略，預設為 `document.location.origin`。

## 在元件或服務中注入用戶端

在元件或服務中透過 `injectClient()` 取得用戶端實例，再呼叫 `client.execute(command)` 發送請求。

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

## 透過 Angular DI 註冊攔截器

`withInterceptors` 接受工廠函式。每個工廠會透過 Angular 的 `useFactory` 呼叫，因此可注入其他 Angular 權杖（例如 `HttpClient`、`Router`、`LOCALE_ID`）。

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

工廠在用戶端建立時執行，回傳的攔截器依註冊順序形成洋蔥呼叫鏈。透過 Angular DI，你可以將設定、驗證狀態或紀錄服務注入攔截器。

## API 參考

### `provideClient(...features): EnvironmentProviders`

建立用戶端並將其註冊為可注入的 `Client` 權杖。接受任意數量的 `EnvironmentProviders` 作為功能設定。

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

設定用戶端的基礎請求 URL。若未提供，預設為目前頁面的 `document.location.origin`。

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

註冊攔截器工廠函式。每個工廠透過 Angular `useFactory` 執行，可存取 Angular DI 脈絡。攔截器依註冊順序形成呼叫鏈。

### `injectClient(): Client`

注入由 `provideClient` 註冊的用戶端實例。可用於元件、服務或攔截器。

## 相依性要求

| @defjs/angular | Angular 版本 | @defjs/core |
| -------------- | ------------ | ----------- |
| 19.x           | 18 – 22      | ^0.4.0      |

Angular peer dependency 範圍：`>=18.0.0 <=22.0.0`。Node 執行環境：`>=26`。

## 接下來

- [核心 →](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` 完整用法
- [SSE 與 WebSocket →](/core/sse) — SSE 與 WebSocket 傳輸細節
