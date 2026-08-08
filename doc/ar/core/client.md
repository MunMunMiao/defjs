---
title: العميل
description: أنشئ عملاء صريحين، وركّب الخيارات، ونفّذ أوامر خاصة بكل وسيلة نقل، وافحص الإعداد الحي.
---

# العميل

أنشئ `Client` صراحة ومرّره إلى الكود الذي ينفّذ الأوامر.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

يخزّن العميل الإعداد ويوجّه أوامر HTTP وSSE وWebSocket. ولا يملك registry عامًا أو مدير دورة حياة يعمل في الخلفية.

## تركيب الخيارات

تعمل الخيارات من اليسار إلى اليمين.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

نقطة النهاية النهائية هي `https://api.example.com`. وترتيب المعترضات هو `operationLogger` ثم `authInterceptor` ثم `retryInterceptor`.

يتبع التركيب ثلاث قواعد:

1. تستبدل دوال setter قيمتها. يشمل ذلك `withEndpoint` وtransport handles وquery serializer وcredentials وإعداد XSRF وإعدادات SSE أو WebSocket المفردة.
2. تُلحق `withInterceptors(...items)` العناصر. وتحافظ الاستدعاءات المتعددة على ترتيب إضافة المعترضات.
3. تستبدل `withSSEOptions(...)` و`withWebSocketOptions(...)` سطحيًا كل حقل علوي معرّف. ولا تدمجان كائنات reconnect أو heartbeat أو queue المتداخلة بعمق.

في المثال التالي، يستبدل كائن reconnect الثاني الأول. ولا يحتفظ بـ `attempts: 5`.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

تتجاهل دوال الخيارات المجمّعة الخصائص التي تساوي `undefined`. وكل خاصية علوية أخرى تُمرّر تستبدل القيمة الحالية كاملة.

### خيارات Core

| الخيار                           | الأثر                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| `withEndpoint(url)`              | يضبط نقطة النهاية الأساسية المطلقة لكل وسائل النقل.                        |
| `withHTTPHandle(fetch)`          | يستبدل تنفيذ Fetch الخاص بـ HTTP.                                          |
| `withSSEHandle(fetch)`           | يستبدل تنفيذ Fetch الخاص بـ SSE.                                           |
| `withWebSocketHandle(WebSocket)` | يستبدل منشئ WebSocket.                                                     |
| `withInterceptors(...items)`     | يُلحق معترضات مختلطة لوسائل النقل.                                         |
| `withQueryParamsSerializer(fn)`  | يستبدل تسلسل query في HTTP وSSE وWebSocket.                                |
| `withCredentials(boolean)`       | يستخدم Fetch `credentials: 'include'` في HTTP وSSE عندما تكون القيمة true. |
| `withXSRF(options?)`             | يضبط حقن token الخاص بـ XSRF في HTTP.                                      |
| `withSSEOptions(options)`        | يستبدل سطحيًا حقول SSE المعرّفة.                                           |
| `withWebSocketOptions(options)`  | يستبدل سطحيًا حقول WebSocket المعرّفة.                                     |

تضبط دوال SSE وWebSocket المفردة حقلًا علويًا مقابلًا واحدًا. تسرد صفحات وسائل النقل قيمها الافتراضية وآثارها على دورة الحياة.

## تنفيذ الأوامر

لدى `Client.execute` ثلاثة overloads. يعيد كل واحد منها tuple يبدأ بالخطأ ويتكون من ثلاثة عناصر.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

العنصر الثالث هو غلاف `SettledResponse` من Defjs عندما تتوفر استجابة. تشمل خيارات HTTP `abort` أو `timeout`، والاسم الإضافي `signal`، و`context`، ومراقبي تقدم الرفع والتنزيل.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

العنصر الثالث هو لقطة فتح تم التحقق منها عند البدء. أما `stream.open` فهو getter حي منفصل يمكن أن يتغير بعد محاولات reconnect. يقبل تنفيذ SSE الإلغاء و`HttpContext`؛ ويأتي إعداد reconnect وevent queue من خيارات العميل.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

العنصر الثالث هو لقطة اتصال البدء. أما `session.connection` فهو getter حي وقد يصف محاولة اتصال فعلية لاحقة. يقبل تنفيذ WebSocket الإلغاء، إلى جانب `beforeConnect` وheartbeat وprotocols وqueue وreconnect لكل تنفيذ. ولا يقبل `HttpContext`.

راجع [الأخطاء](/ar/core/errors) لمعرفة فروع الفشل الدقيقة، وصفحات [HTTP](/ar/core/http) و[SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) لتفاصيل دورة حياة كل وسيلة نقل.

## نطاق العميل

يمكن لتطبيق متصفح الاحتفاظ بعميل على مستوى module عندما لا تحتوي نقطة النهاية وclosures إلا على حالة آمنة للمتصفح ومستقلة عن الطلب.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

لا تعِد استخدام عميل خادم بين الطلبات عندما تلتقط خياراته أو معترضاته authorization أو cookies أو بيانات tenant أو user أو request context. أنشئ ذلك العميل داخل حد طلب الخادم.

لا يملك `Client` دالة `dispose()`. وهو لا يتتبع الطلبات أو streams أو sessions النشطة. يجب على الكود الذي يبدأ العمل إلغاء طلب HTTP، أو إغلاق مقبض SSE، أو إغلاق جلسة WebSocket عند حد دورة الحياة المقابل.

## الفحص المتقدم

استخدم `isClient(value)` لاختبار علامة العميل وقت التشغيل.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

تعيد `getClientConfig(client)` كائن الإعداد الحي القابل للتعديل والموجود داخل العميل. ليست snapshot ولا view للقراءة فقط.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

يغيّر تعديل هذا الكائن عمليات التنفيذ اللاحقة ويتجاوز تركيب الخيارات المعتاد. فضّل استخدامه للتشخيص أو لكود تكامل خضع لمراجعة دقيقة. ترمي `getClientConfig` خطأ `TypeError` عندما لا يكون الوسيط عميلًا صالحًا.

## التالي

- تعرّف [الأوامر](/ar/core/commands) القيم الممررة إلى `execute`.
- تشرح [المعترضات](/ar/core/interceptors) الترشيح وترتيب البصلة.
- تغطي [السياق](/ar/core/context) metadata ضمن نطاق الطلب لـ HTTP وSSE.
