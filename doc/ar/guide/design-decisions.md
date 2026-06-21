---
title: قرارات التصميم
description: قرارات تصميم API التي قد تختلف عن الأنماط الشائعة في مكتبات HTTP الأخرى.
---

# قرارات التصميم

يتعمد Defjs الاختلاف عن بعض الأنماط الشائعة في مكتبات HTTP الأخرى. يشرح هذا المستند المنطق وراء كل قرار.

## تصميم العميل الصريح

يتطلب Defjs إنشاء كل عميل صراحةً. تنشئ `Client` باستخدام `createClient` وتمرره إلى حيث يحتاجه.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

لماذا هذا التصميم:

- **صديق للاختبار**: مرر نسخ `Client` مختلفة مباشرةً إلى الاختبارات دون الحاجة إلى إعادة تعيين أو محاكاة أي حالة.
- **تعايش بيئات متعددة**: يمكن أن يعمل عدة عملاء بالتوازي في نفس العملية (مثلاً: API داخلي + API عام) بدون تداخل.
- **شفافية التبعيات**: يجب على المتصلين حمل `Client` بشكل صريح، مما يجعل التبعيات مرئية للتحليل الثابت ومراجعة الكود.

إذا كنت بحاجة إلى عميل مشترك في تطبيقك، قم بتصديره من وحدة نمطية:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## تكامل الإطار

`@defjs/angular` و `@defjs/vue` و `@defjs/react` تدمج العملاء الصريحين مع نموذج التبعيات في كل إطار. يستخدم Angular و Vue النمط `provideClient` / `injectClient`، بينما يستخدم React النمط `ClientProvider` / `useClient`. يتيح ذلك تسجيل العملاء واسترجاعهم ضمن شجرة المكونات أو الخدمات.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // استخدم client.execute(...) داخل منطق المكوّن
}
```

## خيارات مستوى الطلب تُمرّر في `execute`، وليس في المنشئ

أصبحت خيارات مستوى الطلب (`abort`، `timeout`، `heartbeat`، `reconnect`، إلخ) تُمرّر عبر الوسيط الثاني لـ `client.execute`، وليس في منشئ الأمر.

```typescript
// صحيح: خيارات مستوى الطلب تذهب إلى execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` مُحمّل بزيادة حسب نوع الأمر

`client.execute` يُرجع تلقائيًا نوع النتيجة الصحيح بناءً على نوع `Command`.

```typescript
// طلب HTTP — يُرجع HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// دفق SSE — يُرجع StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — يُرجع SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` مراقب

أصبح `onInvalidEvent` في SSE مراقبًا. يُتجاهل الاستثناءات التي تُطرح داخله ولا تُوقف الدفق.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // حتى لو أُلقِيَ استثناء هنا، يستمر الدفق
    },
  },
})
```

## تجميع وحدة الأخطاء الفرعية

جميع رموز الخطأ تُصدّر الآن من نقطة الدخول الرئيسية `@defjs/core`.

| Export                  | الوصف               | الاستخدام النموذجي                                          |
| ----------------------- | ------------------- | ----------------------------------------------------------- |
| `RequestError`          | نوع اتحاد الخطأ     | تفريع `switch (error.kind)`                                 |
| `ERR_ABORTED`           | معرّف الإيقاف       | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | معرّف المهلة        | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | إنشاء خطأ نقل       | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | إنشاء خطأ تعريف     | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | إنشاء خطأ حالة HTTP | `createHttpStatusError(404, 'Not Found', response, data)`   |

استورد من نقطة الدخول الرئيسية:

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## تفريع الأخطاء بـ `kind` و `code`

يوصي Defjs بالتفريع بـ `kind` و `code` بدلاً من مقارنة السلاسل.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## قواعد تعريف نقطة النهاية الأكثر صرامة

يُطبّق Defjs قاعدة أكثر صرامة: **عند توفير `build`، يجب أيضًا توفير `input`.**

```typescript
// صحيح: يحتوي على input و build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// صحيح: لا input و لا build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// خطأ: يحتوي على build لكن لا input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // خطأ TypeScript: مفقود input struct
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

تنطبق هذه القاعدة أيضًا على `defineEventStream` و `defineWebSocket`.

## المتطلبات

| الحزمة           | الإصدار المطلوب |
| ---------------- | --------------- |
| `@defjs/core`    | `^0.4.0`        |
| `@defjs/angular` | `19.x`          |
| `@defjs/vue`     | `^0.4.0`        |
| `@defjs/react`   | `^0.4.0`        |

نطاق تبعية Angular النظيرة: `>=18.0.0 <=22.0.0`. نطاق تبعية React النظيرة: `>=18.0.0`. بيئة تشغيل Node: `>=26`.

## ما التالي

- [العميل →](/core/client) — تصميم العميل الصريح والإعداد
- [الأوامر →](/core/commands) — تعريفات الأوامر وقواعد المدخلات
- [الأخطاء →](/core/errors) — بنية `RequestError` والتفريع
