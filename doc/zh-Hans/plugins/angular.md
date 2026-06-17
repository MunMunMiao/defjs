---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` 将 `@defjs/core` 集成到 Angular 的依赖注入系统中，提供 `provideClient` 和 `injectClient`，使拦截器也能受益于 Angular DI。

## 安装

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

## 在应用配置中提供客户端

在 `app.config.ts` 中使用 `provideClient` 和 `withEndpoint` 注册客户端。

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` 创建一个 `@defjs/core` `Client` 实例，并将其注册为可注入的 `Client` 令牌。`withEndpoint` 设置基础请求 URL；如果省略，默认使用 `document.location.origin`。

## 在组件或服务中注入客户端

在组件或服务中通过 `injectClient()` 获取客户端实例，然后调用 `client.execute(command)` 发起请求。

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

## 通过 Angular DI 注册拦截器

`withInterceptors` 接受工厂函数。每个工厂通过 Angular 的 `useFactory` 调用，因此可以注入其他 Angular 令牌（例如 `HttpClient`、`Router`、`LOCALE_ID`）。

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

工厂在客户端创建时执行，返回的拦截器按注册顺序形成洋葱调用链。利用 Angular DI，你可以将配置、认证状态或日志服务注入拦截器。

## API 参考

### `provideClient(...features): EnvironmentProviders`

创建客户端并将其注册为可注入的 `Client` 令牌。接受任意数量的 `EnvironmentProviders` 作为功能配置。

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

设置客户端的基础请求 URL。如果未提供，默认使用当前页面的 `document.location.origin`。

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

注册拦截器工厂函数。每个工厂通过 Angular `useFactory` 执行，可访问 Angular DI 上下文。拦截器按注册顺序形成调用链。

### `injectClient(): Client`

注入由 `provideClient` 注册的客户端实例。可用于组件、服务或拦截器中。

## 依赖要求

| @defjs/angular | Angular 版本 | @defjs/core |
| -------------- | ------------ | ----------- |
| 19.x           | 18 – 22      | ^0.4.0      |

Angular 对等依赖范围：`>=18.0.0 <=22.0.0`。Node 运行时：`>=26`。

## 下一步

- [核心 →](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` 完整用法
- [SSE 和 WebSocket →](/core/sse) — SSE 和 WebSocket 传输细节
