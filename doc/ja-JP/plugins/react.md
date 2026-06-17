---
title: React
description: React 統合 — ClientProvider、useClient、option helpers を使い、型付き @defjs/core client を React アプリケーションで共有します。
---

# @defjs/react

`@defjs/react` は `@defjs/core` を React に統合します。`Client` を一度作成し、React Context 経由でコンポーネントツリーに公開し、子コンポーネントは `useClient()` で読み取ります。

React アプリケーションで HTTP、SSE、WebSocket コマンド向けの型付き client を共有したいときに使います。

## インストール

::: code-group

```bash [npm]
npm install @defjs/react @defjs/core react
```

```bash [pnpm]
pnpm add @defjs/react @defjs/core react
```

```bash [bun]
bun add @defjs/react @defjs/core react
```

:::

`react` は peer dependency です。`@defjs/react` は React 18 以降をサポートします。

## Client を提供する

client が必要なコンポーネントツリーの範囲を `ClientProvider` で包みます。

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <Router />
    </ClientProvider>
  )
}
```

`ClientProvider` は渡された options から `@defjs/core` client を作成し、プライベートな React Context に保存します。

## Client を使う

子コンポーネント内で `useClient()` を呼び、最も近い provider が提供する client を取得します。

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

export function UserProfile() {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      if (!error) {
        setName(user.name)
      }
    })
  }, [client])

  return <div>{name}</div>
}
```

`ClientProvider` の外で `useClient()` を呼ぶと、provider がないことをすぐに見つけられるように実行時エラーを投げます。

## Option Helpers

`withEndpoint` と `withInterceptors` は React パッケージの helpers で、`@defjs/core` client options を生成します。

```tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((request, next) => {
  request.headers.set('Authorization', 'Bearer token')
  return next(request)
})

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(() => authInterceptor)]}>
      <Router />
    </ClientProvider>
  )
}
```

`withInterceptors` はファクトリ関数を受け取ります。各ファクトリは interceptor を返し、生成された interceptors は作成された client に登録されます。

## Client Components

React wrapper には `"use client"` が付いています。React Server Component アプリケーションでは、client component 境界から `ClientProvider` をレンダリングしてください。

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API リファレンス

### `<ClientProvider options?: ClientOption[]>`

client を作成し、子コンポーネントに提供します。Options は provider が client を作成するときに評価されます。

### `useClient(): Client`

最も近い `ClientProvider` の client を返します。provider が見つからない場合はエラーを投げます。

### `withEndpoint(endpoint: string): ClientOption`

client の base endpoint URL を設定します。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

ファクトリ関数を通じて interceptors を登録します。

## 注意点

- React 18 以降が必要です。
- `ClientProvider` は client component のコードに置きます。
- `useClient()` は `ClientProvider` の下で実行する必要があります。
- `@defjs/react` は `@defjs/core` のリクエスト、コマンド、インターセプター、エラーモデルを変更しません。

## 次に読む

- [Client →](/core/client) — Client の作成と設定
- [Interceptors →](/core/interceptors) — オニオンモデルのインターセプター連鎖
- [Commands →](/core/commands) — HTTP、SSE、WebSocket コマンド定義
