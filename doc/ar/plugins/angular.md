---
title: Angular
description: Angular dependency injection integration — provideClient, injectClient, and interceptor factories.
---

# @defjs/angular

يُكامل `@defjs/angular` `@defjs/core` في نظام حقن التبعيات في Angular، ويوفر `provideClient` و `injectClient` ليتمكن الاعتراضات أيضًا من الاستفادة من حقن Angular DI.

## التثبيت

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

## توفير العميل في إعداد التطبيق

استخدم `provideClient` مع `withEndpoint` في `app.config.ts` لتسجيل العميل.

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint } from '@defjs/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}
```

يُنشئ `provideClient` نسخة `Client` من `@defjs/core` ويسجّلها كـ Token قابل للحقن. يضبط `withEndpoint` عنوان URL الأساسي للطلب؛ إذا حُذف، يكون الافتراضي `document.location.origin`.

## حقن العميل في المكونات أو الخدمات

استرجع نسخة العميل عبر `injectClient()` في مكون أو خدمة، ثم استدعِ `client.execute(command)` لتنفيذ الطلبات.

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

## تسجيل الاعتراضات عبر Angular DI

يقبل `withInterceptors` دوال مصنع. يُستدعى كل مصنع عبر `useFactory` في Angular، لذا يمكنه حقن رموز Angular أخرى (مثلاً `HttpClient`، `Router`، `LOCALE_ID`).

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

تُنفّذ المصانع وقت إنشاء العميل، وتُشكّل الاعتراضات المُرجعة سلسلة استدعاء بصل بترتيب التسجيل. باستخدام حقن Angular DI، يمكنك حقن الإعدادات أو حالة المصادقة أو خدمات التسجيل في الاعتراضات.

## مرجع واجهة برمجة التطبيقات

### `provideClient(...features): EnvironmentProviders`

يُنشئ عميلًا ويسجّله كـ Token قابل للحقن `Client`. يقبل أي عدد من `EnvironmentProviders` كإعدادات ميزات.

```typescript
provideClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(() => myInterceptor()),
)
```

### `withEndpoint(endpoint: string): EnvironmentProviders`

يضبط عنوان URL الأساسي للطلب للعميل. إذا لم يُقدّم، يكون الافتراضي `document.location.origin` للصفحة الحالية.

### `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`

يسجّل دوال مصنع للاعتراضات. يُنفّذ كل مصنع عبر `useFactory` في Angular، مع الوصول إلى سياق Angular DI. تُشكّل الاعتراضات سلسلة استدعاء بترتيب التسجيل.

### `injectClient(): Client`

يحقن نسخة العميل المُسجّلة بواسطة `provideClient`. يمكن استخدامه في المكونات أو الخدمات أو الاعتراضات.

## المتطلبات

| @defjs/angular | إصدار Angular | @defjs/core |
| -------------- | ------------- | ----------- |
| 19.x           | 18 – 22       | ^0.4.0      |

نطاق تبعية Angular النظيرة: `>=18.0.0 <=22.0.0`. بيئة تشغيل Node: `>=26`.

## ما التالي

- [الأساسية →](/core/client) — الاستخدام الكامل لـ `defineRequest` و `defineEventStream` و `defineWebSocket`
- [SSE و WebSocket →](/core/sse) — تفاصيل نقل SSE و WebSocket
