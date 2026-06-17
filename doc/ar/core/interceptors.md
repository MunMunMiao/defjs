---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# الاعتراضات

تُقسم اعتراضات `@defjs/core` حسب طبقة النقل: HTTP و SSE و WebSocket. تشارك نفس نموذج تنفيذ سلسلة البصل لكنها تتعامل مع أشكال طلب/استجابة مختلفة: HTTP يُرجع `Promise<HttpResponse>`، SSE يُرجع `Promise<EventStreamHandle>`، و WebSocket يُرجع `Promise<WebSocketSessionLike>`.

تُسجّل الاعتراضات على مستوى `Client` عبر `withInterceptors(...)`. يُرشّح العميل ويوزّع تلقائيًا على سلسلة الاعتراض الصحيحة بناءً على نوع الأمر.

## ثلاثة أنواع اعتراض

### اعتراضات HTTP

تعمل اعتراضات HTTP على `HttpRequest` وتُرجع `Promise<HttpResponse>`. الاستخدام النموذجي: حقن رؤوس المصادقة، التسجيل، إعادة المحاولة، تحويل الأخطاء.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### اعتراضات SSE

tعمل اعتراضات SSE على `HttpRequest` (الطلب HTTP قبل الاتصال) وتُرجع `Promise<EventStreamHandle>`. الاستخدام النموذجي: حقن رؤوس المصادقة قبل اتصال SSE، مراقبة حالة الاتصال.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### اعتراضات WebSocket

tعمل اعتراضات WebSocket على `HttpRequest` (الطلب HTTP قبل مصافحة الاتصال) وتُرجع `Promise<WebSocketSessionLike>`. الاستخدام النموذجي: تعديل URL أو حقن رؤوس البروتوكول الفرعي قبل مصافحة WebSocket.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## نموذج تنفيذ سلسلة البصل

تستخدم جميع سلاسل الاعتراض الثلاث **نموذج البصل**: مرحلة الطلب تدخل بترتيب التسجيل، ومرحلة الاستجابة تُرجع بترتيب عكسي.

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // مرحلة الطلب: أول داخل
  const res = await next(req)
  order.push(1.1) // مرحلة الاستجابة: آخر خارج
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // مرحلة الطلب: آخر داخل
  const res = await next(req)
  order.push(3.1) // مرحلة الاستجابة: أول خارج
  return res
})

// ترتيب التسجيل: a -> b -> c
// ترتيب التنفيذ: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### تعديل الطلبات والاستجابات

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### تغليف نتائج الإرجاع

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## أمثلة اعتراض شائعة

### اعتراض المصادقة

حقن Bearer Token في الرؤوس. HTTP و SSE يشاركان نفس المنطق.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### اعتراض التسجيل

سجل مدة الطلب ورمز الحالة.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### اعتراض إعادة المحاولة

أعد محاولة رموز حالة محددة. يجب تسجيل اعتراض إعادة المحاولة بالقرب من أسفل السلسلة، بعد التسجيل ولكن قبل الطلب الفعلي.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### اعتراض Basic Auth (مدمج)

يوفر `@defjs/core` اعتراضات Basic Auth مدمجة لـ HTTP و SSE.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

يستخدم الترميز الافتراضي `globalThis.btoa`. للبيئات بدون `btoa` (مثلاً Node)، خصّص عبر `options.encode`:

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## التسجيل والترشيح

### التسجيل عبر `withInterceptors`

تُسجّل الاعتراضات وقت `createClient` عبر `withInterceptors(...)`. يمكن للمصفوفة نفسها مزج أنواع الاعتراض الثلاثة؛ يُرشّح العميل تلقائيًا حسب نوع الأمر.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### قواعد الترشيح

يُرشّح العميل الاعتراضات حسب نوع الأمر:

| نوع الأمر                     | شرط الترشيح             | الدالة الداخلية                |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

تحافظ الاعتراضات المُرشّحة على ترتيب تسجيلها الأصلي، ثم تُشكّل سلسلة بصل.

```typescript
// منطق تنفيذ داخلي مبسّط
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### ترتيب الاعتراض والتركيب

تُلحق استدعاءات `withInterceptors` المتعددة الاعتراضات بالترتيب.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // أولاً
  withInterceptors(authInterceptor, retryInterceptor), // ثانياً
)
// الترتيب النهائي: تسجيل -> مصادقة -> إعادة محاولة
```

## ملاحظات بيانات الجسم

عندما يستبدل اعتراض `body`، تصبح بيانات الوصف `bodyContentType` القديمة غير صالحة تلقائيًا لمنع إرسال `Content-Type` غير صحيح إلى الخادم.

```typescript
// الاحتفاظ بجسم الأصلي: بيانات Content-Type تبقى صالحة
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// استبدال الجسم: Content-Type القديم يُمسح، ونوع الجسم الجديد يحدده
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## مرجع واجهة برمجة التطبيقات

### دوال الإنشاء

| Function                         | الوصف                  |
| -------------------------------- | ---------------------- |
| `createHttpInterceptor(fn)`      | إنشاء اعتراض HTTP      |
| `createSSEInterceptor(fn)`       | إنشاء اعتراض SSE       |
| `createWebSocketInterceptor(fn)` | إنشاء اعتراض WebSocket |

### الأنواع

| النوع                  | الوصف                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| `HttpInterceptor`      | كائن اعتراض HTTP `{ kind: 'http', fn: InterceptorFn }`                        |
| `SSEInterceptor`       | كائن اعتراض SSE `{ kind: 'sse', fn: SSEInterceptorFn }`                       |
| `WebSocketInterceptor` | كائن اعتراض WebSocket `{ kind: 'web-socket', fn: WebSocketInterceptorFn }`    |
| `Interceptor`          | اتحاد أنواع الاعتراض الثلاثة                                                  |
| `HttpInterceptorNext`  | معالج next لـ HTTP `(req: HttpRequest) => Promise<HttpResponse>`              |
| `SSEHandler`           | معالج next لـ SSE `(req: HttpRequest) => Promise<EventStreamHandle>`          |
| `WebSocketHandler`     | معالج next لـ WebSocket `(req: HttpRequest) => Promise<WebSocketSessionLike>` |

### الاعتراضات المدمجة

| Function                                         | الوصف                     |
| ------------------------------------------------ | ------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | اعتراض Basic Auth لـ HTTP |
| `basicAuthSSEInterceptor(credential, options?)`  | اعتراض Basic Auth لـ SSE  |

## ما التالي

- [العميل →](/core/client) — إنشاء العملاء وإعداد الاعتراضات
- [طلبات HTTP →](/core/http) — `defineRequest` وأنماط المخرجات
- [SSE →](/core/sse) — تعريف SSE والتدفق
- [WebSocket →](/core/web-socket) — تعريف WebSocket ودورة الحياة
