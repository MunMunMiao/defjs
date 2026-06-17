---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# البدء السريع

Defjs هي مكتبة TypeScript لتعريف واجهات برمجة تطبيقات مكتوبة وتنفيذها عبر وسائل نقل متعددة وبيئات تشغيل JavaScript.

## التثبيت

استخدم مدير الحزم الذي تفضله:

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## استخدام CDN

استورد مباشرة كوحدة ES دون أداة بناء:

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## ثلاث خطوات لأول طلب لك

### الخطوة 1: إنشاء عميل

العميل هو نقطة الدخول لتنفيذ جميع الطلبات. أنشئ نسخة بـ `createClient` واضبط نقطة النهاية الأساسية:

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### الخطوة 2: تعريف طلب

استخدم `defineRequest` لتعريف نقطة نهاية HTTP مكتوبة. استخدم `struct` لوصف شكل المدخلات والاستجابات:

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
المفاتيح في `output` هي رموز حالة HTTP. يحدد Defjs تلقائيًا المخطط المطابق وقت التشغيل ويستنتج أنواع TypeScript وفقًا لذلك: تُعتبر استجابات 2xx بيانات نجاح، والاستجابات غير 2xx بيانات خطأ.
:::

### الخطوة 3: التنفيذ

استدعِ `client.execute` مع أمر طلبك وإعداد اختياري:

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // الخطأ مكتوب بناءً على مخططات غير 2xx في output
  console.error(error.code, error.message)
  return
}

// user مكتوب كـ { id: number; name: string }
console.log(user.name)
```

## مثال كامل

إليك مثال من النهاية إلى النهاية مع تحقق من المدخلات، تحقق من المخرجات، معالجة الأخطاء، واعتراض:

```typescript
import { createClient, defineRequest, struct, tag, withEndpoint, withInterceptors } from '@defjs/core'

// 1. إنشاء العميل
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. تعريف الطلب
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': tag(struct.string(), { kind: 'header' }),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. التنفيذ
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## مرجع سريع لواجهة برمجة التطبيقات الأساسية

| API                    | الوصف                              | الاستخدام النموذجي                                                             |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | إنشاء عميل طلب                     | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | تعريف نقطة نهاية HTTP              | `defineRequest({ method: 'GET', path: '/user', output: { 200: UserSchema } })` |
| `defineEventStream`    | تعريف نقطة نهاية SSE               | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | تعريف نقطة نهاية WebSocket         | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | منشئ المخطط                        | `struct.object({ id: struct.number() })`                                       |
| `tag`                  | وسم بيانات للحقول                  | `tag(struct.string(), { kind: 'header' })`                                     |
| `withEndpoint`         | تعيين عنوان URL الأساسي            | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | تسجيل الاعتراضات                   | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | تمكين بيانات الاعتماد عبر النطاقات | `withCredentials(true)`                                                        |
| `withSSEOptions`       | ضبط خيارات SSE                     | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | ضبط خيارات WebSocket               | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## ما التالي

- [العميل →](/core/client) — إنشاء العملاء، تنفيذ الأوامر، والإعداد
- [الأوامر →](/core/commands) — `defineRequest`، `defineEventStream`، `defineWebSocket`
- [الأخطاء →](/core/errors) — بنية `RequestError` وأنماط التفريع
