---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue` هو إضافة Vue 3 لـ `@defjs/core`. يوفر `provideClient` لتسجيل نسخة `Client` على مستوى التطبيق، و `injectClient` للوصول إلى تلك النسخة داخل المكونات أو composables.

يشارك كلاهما نفس مساعدي الإعداد `withEndpoint` و `withInterceptors` من `@defjs/core`.

## التثبيت

```bash
npm install @defjs/vue @defjs/core
# أو
pnpm add @defjs/vue @defjs/core
# أو
bun add @defjs/vue @defjs/core
```

## البدء السريع

### 1. توفير العميل عند دخول التطبيق

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

يُرجع `provideClient` إضافة Vue قياسية. يستخدم داخليًا `app.provide()` لحقن نسخة `Client` في سياق التطبيق. يمكن لجميع المكونات الفرعية الوصول إليها عبر `injectClient()`.

### 2. الحقن والاستخدام في المكونات

```typescript
// UserCard.vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineRequest, struct } from '@defjs/core'

const client = injectClient()

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
      email: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser())
  if (error) {
    console.error('Request failed:', error.code, error.message)
    return
  }
  console.log(user.id, user.name, user.email) // fully typed
}
</script>
```

## إعداد الاعتراضات

استخدم `withInterceptors` لتسجيل مصفوفات دوال المصنع. يُنفّذ كل مصنع أثناء تثبيت الإضافة، وتُسجّل نسخة الاعتراض المُرجعة في العميل.

```typescript
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((req, next) => {
  req.headers.set('Authorization', `Bearer ${localStorage.getItem('token')}`)
  return next(req)
})

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)
```

> ملاحظة: يقبل `withInterceptors` **دوال مصنع** (`() => Interceptor`)، وليس نسخ اعتراضات. هذا يسمح بإنشاء النسخة عند الطلب أثناء مرحلة توفير Vue.

## أمثلة SSE و WebSocket

تدعم نسخة العميل SSE و WebSocket بنفس الاستخدام الموجود في الحزمة الأساسية:

```typescript
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineEventStream, defineWebSocket, struct } from '@defjs/core'

const client = injectClient()

// SSE
const notifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({ id: struct.number(), text: struct.string() }),
  },
})

const [error, stream] = await client.execute(notifications())
if (!error) {
  for await (const event of stream) {
    console.log(event.message) // typed as { id: number, text: string }
  }
}

// WebSocket
const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})

const [wsError, ws] = await client.execute(chat())
if (!wsError) {
  ws.send({ type: 'send', data: { text: 'Hello' } })
  for await (const msg of ws.receive) {
    console.log(msg.message)
  }
}
</script>
```

لمزيد من تفاصيل النقل، راجع:

- [التوثيق الأساسي](/core/client) — الاستخدام الكامل لـ `defineRequest` و `defineEventStream` و `defineWebSocket`
- [توثيق SSE](/core/sse) — إعادة اتصال SSE التلقائية، نبضة القلب، والضغط العكسي
- [توثيق WebSocket](/core/web-socket) — اتصال WebSocket وأنواع الرسائل

## مرجع واجهة برمجة التطبيقات

### `provideClient(...feature: ClientOption[]): Plugin`

يُنشئ إضافة Vue. عند التثبيت، يُنشئ نسخة `Client` عبر `createClient(...)` ويوفرها لسياق التطبيق باستخدام `HTTP_CLIENT` كمفتاح الحقن.

### `injectClient(): Client`

استدعِ داخل `setup` المكون أو composables لاسترجاع نسخة العميل المُحقت. إذا لم يُستدعَ `app.use(provideClient(...))` أولاً، يُرمى خطأ وقت التشغيل:

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

يضبط عنوان URL الأساسي لطلبات HTTP. إذا حُذف، تكون الطلبات الافتراضية مُسبقة بـ `document.location.origin`.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

يضبط الاعتراضات. يُنفّذ كل مصنع أثناء تثبيت الإضافة، وتُشكّل الاعتراضات المُرجعة سلسلة استدعاء بصل بترتيب التسجيل.

### `HTTP_CLIENT`

`InjectionKey<Client>` في Vue، يُستخدم كمفتاح `provide` / `inject` الأساسي. عادةً لا تحتاجه مباشرة، لكنه متاح للتسلسلات الهرمية للحقن المخصصة:

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## ما التالي

- [التوثيق الأساسي](/core/client) — الاستخدام الكامل لـ `defineRequest` و `defineEventStream` و `defineWebSocket`
