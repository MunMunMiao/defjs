---
title: الأوامر
description: عرّف نقاط النهاية، ابنِ أوامر معتمة، عيّن المدخلات، واستنتج نتائج النقل.
---

# الأوامر

تعريف واحد → منشئ → أمر معتم → `client.execute`. نفس المسار لـ HTTP وSSE وWebSocket.

## الإعداد الأساسي

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## اختر تعريفًا

| التعريف                  | العقد                                                 | القيمة عند النجاح                    |
| ------------------------ | ----------------------------------------------------- | ------------------------------------ |
| `defineRequest(...)`     | الطريقة، مسار نسبي، مدخل اختياري، مخرج حالة اختياري   | بيانات مفكوكة + `HttpResponse`       |
| `defineEventStream(...)` | المسار، حدود المخزن/الطابور، خريطة اسم حدث → Struct   | `EventStreamHandle` + لقطة open      |
| `defineWebSocket(...)`   | المسار، خريطة واردة، خريطة صادرة اختيارية، حد الطابور | `WebSocketSession` + لقطة connection |

بلا `input` → المنشئ لا يأخذ وسيطًا. مع `input` → مرّر قيمة Struct حتى لو كان كل حقل متداخل اختياريًا. أقسام `path` / `query` / `headers` الاختيارية يمكن حذفها؛ قسم بحقل مطلوب لا يمكن حذفه. وجود غلاف جسم يعني أن الجسم مطلوب.

أبقِ الأوامر معتمة. لا تحفر في العلامات أو الرموز.

## التعيين التلقائي للطلب

استخدم `struct.request(...)` عندما يملك المدخل المنطقي بالفعل path / query / headers / body:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: { 201: struct.object({ id: struct.number(), name: struct.string() }) },
})
void createUser
```

الأسماء المستعارة تعيد كتابة مفاتيح السلك الصادرة فقط. القيم المحلَّلة ومدخلات الأمر تبقي الأسماء المنطقية.

## `build` مخصص

الجأ إلى `build(request, input)` عندما يختلف شكل المستدعي عن شكل السلك. إنه إسقاط مقيّد — وليس مكانًا للتفريع على سياسة المصادقة أو اختراع آثار جانبية.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.withQuery({ q: input.q, page: input.page ?? 1 })
  },
  output: { 200: struct.object({ items: struct.array(struct.string()) }) },
})
void search
```

## أشكال مخرج الحالة

`output` يمكن أن يكون خريطة حالة → Struct أو مصفوفة `{ status, body }[]`. الحالة الدقيقة تفوز. إدخالات المصفوفة: تطابق لاحق يتجاوز تطابقًا مجمّعًا سابقًا. بلا إعلان مطابق → `UNDECLARED_STATUS` قبل فك الجسم.

## وصفات ذات صلة

- [GET مع 404 معلَن](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
