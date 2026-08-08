---
title: الأوامر
description: عرّف نقاط النهاية، وأنشئ منشئات الأوامر والأوامر، واربط مدخلات Struct بالـ wire، واستنتج أنواع مخرجات HTTP.
---

# الأوامر

يستخدم Defjs ثلاث مراحل مترابطة:

1. يصف **تعريف نقطة النهاية** عقد HTTP أو SSE أو WebSocket مستقرًا.
2. **منشئ الأمر** هو الدالة التي تعيدها `defineRequest` أو `defineEventStream` أو `defineWebSocket`.
3. **الأمر** هو القيمة التي تعود عند استدعاء ذلك المنشئ مع input. مرّر الأمر إلى `client.execute(...)`.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

الكائن الممرر إلى `defineRequest` هنا هو تعريف نقطة النهاية، و`getUser` هو منشئ الأمر، و`command` هو الأمر.

## تعريفات نقاط نهاية HTTP

تقبل `defineRequest(...)` الحقول التالية:

| الحقل          | المعنى                                                                |
| -------------- | --------------------------------------------------------------------- |
| `method`       | نص HTTP method.                                                       |
| `path`         | path نسبي لنقطة النهاية، مع placeholders اختيارية بشكل `:name`.       |
| `input`        | Struct يُستخدم لفك الترميز البنيوي لمدخل الأمر.                       |
| `build`        | إسقاط مرتبط بالـ Struct من حقول input إلى أجزاء الطلب. يتطلب `input`. |
| `output`       | ربط status بـ Struct لفك ترميز response واستنتاج result.              |
| `responseType` | نمط response اختياري: `json` أو `text` أو `blob` أو `arraybuffer`.    |

استخدم `struct.request(...)` عندما ترتبط حقول الأمر مباشرة بأقسام wire:

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

يستخدم المستدعون أسماء الحقول المنطقية. وتختار aliases مفاتيح wire.

## متى يكون وسيط منشئ الأمر اختياريًا؟

يقبل المنشئ الذي لا يملك `input` استدعاءً بلا وسيط:

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

مدخلات Object Struct جزئية على مستوى النوع. كل خاصية في الكائن اختيارية للمستدعي، وأقسام request اختيارية أيضًا. يملأ فك الترميز البنيوي حقول output غير الاختيارية بقيم صفرية، لذلك لا يجعل أي من الشكلين وسيط المنشئ مطلوبًا.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search() // Accepted. The decoded q value is ''.
search({ query: { q: 'docs' } })
```

استخدم input أوليًا أو مصفوفيًا عندما يجب على المنشئ استقبال وسيط. يستخدم هذا المثال قيمة أولية ويسقطها في path parameter:

```typescript
const getUserById = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.number(),
  build(request, input) {
    request.setPathParams({ id: input })
  },
})

// getUserById() // TypeScript error: an argument is required.
getUserById(42)
```

هذه قاعدة تخص اختيارية الوسيط، وليست تحققًا من قواعد العمل. ما زال المستدعي قادرًا على تمرير قيم يقبلها input type الخاص بالـ Struct، وتتلقى حقول الكائن المفقودة قيمًا صفرية.

## بناء الطلب تلقائيًا

عندما يكون `input` من نوع `struct.request(...)` ويُحذف `build`، يربط Defjs الأقسام المعلنة تلقائيًا:

- يستبدل `path` placeholders في path.
- يتحول `query` إلى query parameters.
- يتحول `headers` إلى request headers.
- يستخدم `body` غلاف body الخاص به.

يجب أن تعلن أجسام الطلب حدًا مدعومًا:

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

لا تضع `struct.object(...)` عاريًا في `request.body`؛ ترفضه `struct.request(...)`. تدعم HTTP كل أشكال body. يرفض SSE قسم body، ويرفض WebSocket قسمي headers وbody.

## `build` المخصص

استخدم `build(request, input)` عندما تحتاج الحقول المنطقية إلى مواقع أو مفاتيح wire مختلفة. يمثل الوسيط المسمى `input` **إسقاطًا مرتبطًا بالـ Struct**، وليس قيمة المستدعي بعد parse.

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

يستطيع الإسقاط:

- اختيار الحقول المعلنة؛
- اختيار مفاتيح wire المستهدفة؛
- إسقاط مصفوفة عنصرًا مقابل عنصر باستخدام `.map(...)`؛
- ترميز كائن مختار باستخدام aliases حقوله عندما يُربط إلى JSON.

لا يستطيع الإسقاط فحص قيم المستدعي أو التفريع عليها أو حساب تحويلات اعتباطية أو تغيير عدد عناصر المصفوفة أو حقن قيم حرفية. فمثلًا، `request.setJson({ version: 'v1' })` ليس إسقاطًا صالحًا لأن `'v1'` لم تأتِ من واجهة ربط input.

طبّع بيانات التطبيق وتحقق منها قبل إنشاء الأمر. واترك `build` للربط التصريحي مع wire.

### قدرات Build

| الهدف                                                         | HTTP | SSE | WebSocket |
| ------------------------------------------------------------- | ---- | --- | --------- |
| `setPathParams`, `setQueryParams`                             | نعم  | نعم | نعم       |
| `setHeaders`, `addHeaders`                                    | نعم  | نعم | لا        |
| دوال body الخاصة بـ JSON والنص وHTML وform وBlob وArrayBuffer | نعم  | لا  | لا        |

سياق build في TypeScript خاص بوسيلة النقل. كما ترفض فحوص وقت التشغيل output غير المدعوم إذا جرى تجاوز type checks.

## استنتاج مخرجات HTTP

يدعم `output` خريطة كائنية أو مصفوفة من أزواج status/body:

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

نوع نجاح HTTP هو اتحاد أجسام 2xx المعلنة. و`error.data` هو اتحاد أجسام non-2xx المعلنة. يحتاج الشكل المصفوفي إلى `as const` للحفاظ على status literals والمصفوفات readonly المجمّعة.

عندما يكون `output` معلنًا، يجب أن يملك كل status معاد Struct مطابقًا. ينتج status غير مطابق، سواء كان 2xx أو non-2xx، خطأ `UNDECLARED_STATUS`. وعند حذف `output` يُتجاهل response body وتكون result مساوية لـ `undefined`.

## تعريفات SSE وWebSocket

تستبدل `defineEventStream(...)` حقل HTTP المسمى `output` بخريطة `events`. تختار أسماء الأحداث Structs، ويتعامل إدخال `default` اختياري مع الأسماء غير المعلنة وقت التشغيل.

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

تعلن `defineWebSocket(...)` خرائط الرسائل `incoming` و`outgoing` الاختيارية. تستخدم message envelopes الحقل `type` كـ discriminator.

```typescript
const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

راجع [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) لمعرفة فك الترميز والـ queues وreconnect وملكية الإغلاق.

## تعامل مع الأوامر كقيم opaque

ينبغي لكود التطبيق إنشاء الأوامر وتمريرها إلى `Client.execute(...)`. لا تعتمد على transport tags أو structural reflection.

يصدّر root entry حاليًا interfaces أوامر النقل ودوال executor منخفضة المستوى. لا تحتاج هذه exports في المسار الموصى به، ولم يُحسم التزام استقرارها طويل المدى في هذا التوثيق. أما command tag symbols ودوال guard المستخدمة في runtime dispatch فليست root exports.

## التالي

- تغطي [العميل](/ar/core/client) execute overloads وتركيب الخيارات.
- تملك [HTTP](/ar/core/http) سلوك URL والترميز والاستجابة والإلغاء.
- تشرح [Struct](/ar/core/struct) فك الترميز البنيوي والقيم الصفرية.
