---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

`@defjs/angular` は `@defjs/core` を Angular の依存性注入システムに統合し、`provideClient` と `injectClient` を提供します。インターセプターは Angular DI の恩恵も受けられます。

## インストール

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

## アプリケーション設定でクライアントを提供する

`app.config.ts` で `provideClient` と `withEndpoint` を使ってクライアントを登録します。

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

`provideClient` は `@defjs/core` の `Client` インスタンスを作成し、インジェクト可能な `Client` トークンとして登録します。`withEndpoint` はベースリクエスト URL を設定します；省略された場合、デフォルトは `document.location.origin` です。

## コンポーネントまたはサービスでクライアントを注入する

コンポーネントまたはサービス内で `injectClient()` を使ってクライアントインスタンスを取得し、`client.execute(command)` を呼び出してリクエストを実行します。

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

## Angular DI 経由でインターセプターを登録する

`withInterceptors` はファクトリー関数を受け付けます。各ファクトリーは Angular の `useFactory` を通じて呼び出されるため、他の Angular トークン（例: `HttpClient`、`Router`、`LOCALE_ID`）を注入できます。

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

ファクトリーはクライアント作成時に実行され、返されたインターセプターは登録順にオニオン呼び出し連鎖を形成します。Angular DI を使うことで、インターセプターに設定、認証状態、ログサービスなどを注入できます。

## API リファレンス

### `provideClient(...features): EnvironmentProviders`

クライアントを作成し、インジェクト可能な `Client` トークンとして登録します。フィーチャー設定として任意の数の `EnvironmentProviders` を受け付けます。

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

クライアントのベースリクエスト URL を設定します。指定しない場合、現在のページの `document.location.origin` をデフォルトとします。

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

インターセプターファクトリー関数を登録します。各ファクトリーは Angular `useFactory` を介して実行され、Angular DI コンテキストにアクセスできます。インターセプターは登録順に呼び出し連鎖を形成します。

### `injectClient(): Client`

`provideClient` で登録されたクライアントインスタンスを注入します。コンポーネント、サービス、またはインターセプター内で使用できます。

## 依存関係

| @defjs/angular | Angular バージョン | @defjs/core |
| -------------- | ------------------ | ----------- |
| 19.x           | 18 – 22            | ^0.4.0      |

Angular peer dependency 範囲: `>=18.0.0 <=22.0.0`。Node ランタイム: `>=26`。

## 次に読む

- [Core →](/core/client) — `defineRequest`、`defineEventStream`、`defineWebSocket` の完全な使い方
- [SSE & WebSocket →](/core/sse) — SSE と WebSocket トランスポートの詳細
