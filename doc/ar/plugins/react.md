---
title: React
description: تكامل React — ClientProvider و useClient و option helpers لمشاركة عميل @defjs/core مكتوب الأنواع داخل تطبيقات React.
---

# @defjs/react

يدمج `@defjs/react` حزمة `@defjs/core` مع React. ينشئ `Client` مرة واحدة، ويعرضه عبر React Context، وتقرأه المكونات الفرعية باستخدام `useClient()`.

استخدمه عندما يحتاج تطبيق React إلى عميل مكتوب الأنواع ومشترك لأوامر HTTP أو SSE أو WebSocket.

## التثبيت

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

`react` هو peer dependency. يدعم `@defjs/react` إصدار React 18 وما بعده.

## توفير Client

غلّف جزء شجرة المكونات الذي يحتاج إلى client باستخدام `ClientProvider`.

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

ينشئ `ClientProvider` عميل `@defjs/core` من options المقدمة، ويحفظه داخل React Context خاص.

## استخدام Client

استدعِ `useClient()` داخل مكوّن فرعي للحصول على أقرب client مُقدّم.

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

إذا استُدعِي `useClient()` خارج `ClientProvider`، فسيرمي خطأ وقت التشغيل كي تظهر مشكلة provider المفقود فورًا.

## Option Helpers

`withEndpoint` و `withInterceptors` هما helpers من حزمة React ينتجان options لعميل `@defjs/core`.

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

يقبل `withInterceptors` دوال مصنع. تُرجع كل دالة interceptor، وتُسجّل interceptors الناتجة على client الذي تم إنشاؤه.

## Client Components

React wrapper معلّم بـ `"use client"`. في تطبيقات React Server Component، اعرض `ClientProvider` من حدود client component.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## مرجع API

### `<ClientProvider options?: ClientOption[]>`

ينشئ client ويوفره للمكونات الفرعية. تُقيّم options عندما ينشئ provider ذلك client.

### `useClient(): Client`

يعيد client من أقرب `ClientProvider`. يرمي خطأ إذا لم يجد provider.

### `withEndpoint(endpoint: string): ClientOption`

يضبط base endpoint URL للعميل.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

يسجل interceptors عبر دوال مصنع.

## ملاحظات

- يتطلب React 18 أو إصدارًا أحدث.
- يجب وضع `ClientProvider` داخل كود client component.
- يجب تشغيل `useClient()` أسفل `ClientProvider`.
- لا يغيّر `@defjs/react` نموذج الطلب أو الأمر أو interceptor أو الخطأ من `@defjs/core`.

## ما التالي

- [العميل →](/core/client) — إنشاء Client وإعداده
- [المعترضات →](/core/interceptors) — سلاسل interceptor بنموذج البصل
- [الأوامر →](/core/commands) — تعريفات أوامر HTTP و SSE و WebSocket
