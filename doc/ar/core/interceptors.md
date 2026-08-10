---
title: المعترضات
description: رشّح المعترضات حسب وسيلة النقل، وركّبها بترتيب البصلة، وانسخ الطلبات بأمان، واقطع السلسلة، ونفّذ سياسات auth وretry محدودة.
---

# المعترضات

تغلّف المعترضات حد النقل. لكل من HTTP وSSE وWebSocket نوع interceptor ونوع result مستقل.

| Factory                      | الطلب         | Result من `next`                      |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

سجّل معترضات مختلطة باستخدام `withInterceptors(...)`. يرشّح العميل حسب `kind` ويحافظ على ترتيب التسجيل داخل كل وسيلة نقل.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## ترتيب البصلة

يتبع مسار الطلب ترتيب التسجيل. ثم يعود مسار النتيجة بالترتيب المعاكس:

```typescript
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

تُلحق استدعاءات `withInterceptors(...)` المتعددة العناصر:

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

لا يجوز لـ WebSocket interceptor استدعاء `next` أكثر من مرة. إذا فشلت chain بعد إنشاء session، يسوي Core تلك session غير المسلّمة قبل إعادة خطأ interceptor الأصلي. وإذا نجحت chain مع short-circuit session أخرى، يغلق Core الـ session المنشأة؛ ويحافظ wrapper على الارتباط بتمرير Promise `closed` الأصلية.

## انسخ الطلبات بأمان

تعامل مع الطلب الوارد على أنه مملوك للسلسلة. أنشئ كائن `Headers` جديدًا قبل تعديل headers:

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

ينطبق النمط نفسه على headers في SSE. لا يستطيع منشئ WebSocket في المتصفح إرسال handshake headers اعتباطية، لذلك لا تؤدي تعديلات `request.headers` داخل WebSocket interceptor إلى مصادقة اتصال المتصفح.

عند استبدال HTTP body، انشر request واستبدل `body`. يكتشف حد Fetch أن metadata الخاصة بـ content type القديم لم تعد تخص body الجديد. لا تعِد استخدام body من نوع `ReadableStream` جرى استهلاكه.

## قطع السلسلة

يستطيع المعترض تجاوز `next`، لكنه يجب أن يعيد نوع النتيجة المتوقع لوسيلة النقل. في HTTP، تستطيع `makeResponse(...)` إنشاء غلاف من Defjs:

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

تستمر طبقة الأوامر المعتادة في توزيع هذه response حسب status وoutput Struct. أعلن status إذا كان جزءًا من عقد نقطة النهاية.

يتطلب قطع SSE أو WebSocket مقبضًا أو جلسة كاملة ومتوافقة، بما في ذلك دلالات الإغلاق. وغالبًا ما يكون هذا أصعب من إعادة response اصطناعية في HTTP.

## حافظ على Live Getters للجلسة

لا تغلّف جلسة WebSocket باستخدام `{ ...session }`. يقرأ spread قيمتي `state` و`connection` مرة واحدة، ويحوّل getter الحي إلى قيمة قديمة. فوّض كل عضو صراحة:

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get bufferedAmount() {
      return session.bufferedAmount
    },
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

يجب أن يحافظ الغلاف أيضًا على ملكية المورد. لا تستبدل `closed` أو تحجب `close` أو تفصل incoming iterable إلا إذا كان ذلك مقصودًا وموثقًا في التطبيق.

## تسجيل محدود

فضّل أسماء عمليات ثابتة ومجموعة صغيرة من الحقول التي خضعت للمراجعة:

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

لا تسجّل endpoint URLs أو query strings أو headers أو bodies أو raw causes أو SSE event IDs أو WebSocket payloads افتراضيًا.

## أعد محاولة HTTP بتحفظ

تغيّر retries سلوك التطبيق. المثال التالي مقصور على `GET` و`HEAD` و`OPTIONS`؛ ويعيد فقط status يساوي `0` أو `502` أو `503` أو `504`؛ ويحترم `Retry-After`؛ ويتوقف سريعًا عند abort؛ ويرفض stream body.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

لا يعيد هذا المعترض محاولة أخطاء المعترضات المرمية لأنه لا يستطيع تصنيفها بأمان. status الذي يساوي `0` هو غلاف فشل النقل من حد Fetch في Defjs.

لا توسّع مجموعة methods إلى عمليات كتابة بشكل اعتيادي. تتطلب إعادة محاولة `POST` أو `PUT` أو `PATCH` أو `DELETE` عقد idempotency على مستوى التطبيق، وbodies قابلة لإعادة التشغيل، ودعمًا من الخادم، وسياسة status خضعت للمراجعة.

## Basic Authentication

يصدّر root entry الدالتين `basicAuthHttpInterceptor(...)` و`basicAuthSSEInterceptor(...)`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

بيانات Basic credentials مرمّزة بـ base64 فقط، وهذا الترميز قابل للعكس ولا يوفّر تشفيرًا. استخدم TLS. يعتمد encoder الافتراضي على `globalThis.btoa`، وقد لا تكون متاحة، كما أنها لا تقبل إلا نطاقًا محدودًا من المحارف. مرّر `options.encode` عندما تفتقر بيئة التشغيل إلى `btoa` أو تحتاج credentials إلى تنفيذ UTF-8/base64 خضع للمراجعة.

تعمل credential providers عند مرور الطلب عبر المعترض. أبقِ server credentials ضمن نطاق الطلب، ولا تسجّل header الناتج.

## سلامة المراقبين وCallbacks

تستطيع معترضات SSE وWebSocket ربط lifecycle observers بالمقابض المعادة. ألغِ اشتراك WebSocket listeners عند انتهاء مالكها. يعزل WebSocket فشل state listener عبر runtime-error observers، ويمرر فشل runtime-error observer إلى `reportError`، ويعامل رمي reconnect predicate كخطأ نهائي للجلسة.

قد يرمي المعترض أو يرفض Promise. قد تطبّع وسيلة النقل عالية المستوى بعض الإخفاقات إلى `RequestError`، لكن لا ينبغي لكود المعترض الاعتماد على ضمان شامل بأن Promise لن تُرفض أبدًا.

## التالي

- تشرح [العميل](/ar/core/client) التسجيل وتركيب الخيارات.
- توثّق [HTTP](/ar/core/http) غلاف Fetch وسلوك status الذي يساوي 0.
- تملك [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) تفاصيل دورة حياة وسائل النقل.
