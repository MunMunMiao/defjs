---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# العميل

يستخدم `@defjs/core` تصميم **عميل صريح**. يتم تنفيذ كل طلب عبر نسخة `Client` تنشئها صراحةً. يجعل هذا الاختبار وإعداد البيئات المتعددة وتتبع التبعيات مباشرًا.

## إنشاء عميل

استخدم `createClient` مع دالة إعداد واحدة أو أكثر.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

دوال الإعداد تُركّب. الدوال اللاحقة تتجاوز السابقة لنفس المفتاح.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### خيارات الإعداد

| Function                            | الوصف                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| `withEndpoint(url)`                 | عنوان API الأساسي.                                             |
| `withHTTPHandle(fetch)`             | تنفيذ `fetch` مخصص لـ HTTP.                                    |
| `withSSEHandle(fetch)`              | تنفيذ `fetch` مخصص لـ SSE.                                     |
| `withWebSocketHandle(WebSocket)`    | منشئ `WebSocket` مخصص (مثلاً لـ Node).                         |
| `withInterceptors(...interceptors)` | تسجيل اعتراضات طبقة النقل. تُوزّع تلقائيًا حسب `kind`.         |
| `withQueryParamsSerializer(fn)`     | تسلسل مخصص لمعاملات الاستعلام.                                 |
| `withCredentials(boolean)`          | ما إذا كان يتضمن بيانات الاعتماد عبر النطاقات.                 |
| `withXSRF(options)`                 | سلوك قراءة وحقن رمز XSRF.                                      |
| `withSSEOptions(options)`           | إعادة اتصال SSE، طابور، معالجة الأحداث غير الصالحة، إلخ.       |
| `withWebSocketOptions(options)`     | نبضة قلب WebSocket، إعادة اتصال، طابور، بروتوكولات فرعية، إلخ. |

لمزيد من الإعداد الخاص بـ SSE و WebSocket، راجع [SSE](/core/sse) و [WebSocket](/core/web-socket).

## تنفيذ الأوامر

`Client.execute` هي دالة مُحمّلة بزيادة تُوزّع على طبقة النقل الصحيحة بناءً على نوع `Command`.

### طلبات HTTP

مرر أمرًا مبنى بـ `defineRequest`. يُرجع ثلاثية:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

نوع الإرجاع:

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### دفق أحداث SSE

مرر أمرًا مبنى بـ `defineEventStream`. يُرجع مقبض دفق ومعلومات فتح.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

نوع الإرجاع:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### اتصالات WebSocket

مرر أمرًا مبنى بـ `defineWebSocket`. يُرجع كائن جلسة.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

نوع الإرجاع:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## دوال مساعدة

### `isClient`

تحقق مما إذا كانت القيمة نسخة `Client` صالحة.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

استخرج كائن الإعداد الداخلي للتصحيح أو بناء تجريدات أعلى مستوى.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

إذا كانت القيمة ليست نسخة `Client`، يرمي `getClientConfig` خطأ `TypeError`.

## تصميم العميل الصريح

كل عميل في Defjs يتم إنشاؤه صراحةً. تنشئ `Client` باستخدام `createClient` وتمرره إلى حيث يحتاج.

فوائد الإنشاء الصريح:

- **صديق للاختبار**: مرر نسخ `Client` مختلفة مباشرة إلى الاختبارات دون الحاجة إلى إعادة تعيين أو محاكاة أي حالة.
- **تعايش بيئات متعددة**: يمكن أن يعمل عدة عملاء بالتوازي في نفس العملية (مثلاً: API داخلي + API عام).
- **شفافية التبعيات**: يجب على المتصلين حمل `Client` بشكل صريح، مما يجعل التبعيات مرئية للتحليل الثابت ومراجعة الكود.

إذا كنت بحاجة إلى عميل مشترك في تطبيقك، صدّره من وحدة نمطية:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

ثم استورد واستخدم في كود الأعمال:

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## ما التالي

- [طلبات HTTP →](/core/http) — `defineRequest` وأنماط المخرجات
- [SSE →](/core/sse) — تعريف SSE، إعادة الاتصال، وطوابير الأحداث
- [WebSocket →](/core/web-socket) — تعريف WebSocket، نبضة القلب، واستراتيجيات إعادة الاتصال
- [الاعتراضات →](/core/interceptors) — أنواع الاعتراضات وميكانيكية سلسلة البصل
