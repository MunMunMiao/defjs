---
title: البدء
description: ثبّت Defjs، وعرّف endpoint HTTP مضبوط النوع، وأنشئ client واستعمله داخل تطبيقك.
---

# البدء

يتيح Defjs لتطبيقك وصف عقد API مرة واحدة، ثم إعادة استخدامه مع input مضبوط النوع، وفك ترميز وقت التشغيل، ونتائج transport واضحة.

## التثبيت

أضف الحزمة الأساسية إلى تطبيقك:

```sh
pnpm add @defjs/core
```

استخدم أمر npm أو Yarn أو Bun المكافئ إذا كان مشروعك يستعمل مدير حزم آخر. حزمة `@defjs/core` بنمط ESM. وعند تشغيلها على Node.js، تتطلب metadata الحالية Node 22 أو أحدث.

أضف adapter فقط عندما يحتاجه تطبيقك:

| إعداد التطبيق            | الحزم                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| React 18+                | `@defjs/core`، `@defjs/react`، `react`                                                    |
| Vue 3+                   | `@defjs/core`، `@defjs/vue`، `vue`                                                        |
| OpenTelemetry على الخادم | `@defjs/core`، `@defjs/opentelemetry-server`، `@opentelemetry/api`، `@opentelemetry/core` |

::: tip استخدم الوثائق المطابقة للإصدار المثبّت
تشرح هذه الصفحات الـ API الخاص بإصدار الوثائق الحالي. تحقّق من الإصدار المثبّت في تطبيقك. إذا اختلف export أو option، فاستخدم وثائق ذلك الإصدار وملاحظات إصداره بدل خلط أمثلة من إصدارات مختلفة.
:::

## عرّف طلبك الأول

افترض أن API تطبيقك يوفّر `GET /users/:id`. استبدل base URL وresponse Structs بالعقد الفعلي لخدمتك.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

تعيد `defineRequest(...)` **منشئ أمر**. وينشئ استدعاء `getUser(...)` **أمرًا** يحمل تعريف نقطة النهاية ومدخلات الاستدعاء. بعد ذلك تعيد `client.execute(...)` tuple خاصًا بـ HTTP من ثلاثة عناصر:

```typescript
;[error, result, response]
```

عند النجاح تكون `error` مساوية لـ `null`، وتكون `result` البيانات بعد فك ترميزها، وتكون `response` غلاف `HttpResponse` من Defjs. عند الفشل تكون `result` مساوية لـ `undefined`؛ ويكون غلاف الاستجابة أيضًا `undefined` إذا لم تصل أي استجابة.

### لماذا تهم `as const`؟

يستخدم الشكل المصفوفي لـ `output` قيم status الحرفية للفصل بين أجسام نجاح 2xx وأجسام أخطاء non-2xx. تحافظ `as const` على قيم status هذه، وعلى مصفوفات status المجمّعة، كقيم readonly حرفية. من دونها قد يوسّعها TypeScript إلى `number` أو `number[]`، ما يضعف استنتاج فرعي النجاح والخطأ.

الشكل الكائني لـ output مدعوم أيضًا:

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## استخدمه داخل تطبيقك

ضع تعريفات endpoints في modules تصف API خدمتك. أعد استخدام command builders من components أو route handlers أو jobs أو stores. أنشئ client عند الحد الذي يملك endpoint وcredentials وinterceptors ودورة الحياة:

- يمكن لتطبيق المتصفح عادةً مشاركة client واحد؛
- في server rendering، أنشئ client خاصًا بكل request عندما تختلف headers أو cookies أو المستخدم أو tenant؛
- الكود الذي يفتح SSE أو WebSocket مسؤول أيضًا عن استهلاك المورد وإغلاقه.

## الخطوات التالية

- تشرح [الأوامر](/ar/core/commands) الربط التلقائي للطلب والإسقاطات المخصصة المرتبطة بالـ Struct.
- توثّق [الأخطاء](/ar/core/errors) tuples الخاصة بوسائل النقل الثلاث واتحاد `RequestError`.
- تغطي [HTTP](/ar/core/http) حل URL وأجسام الطلب وفك ترميز المخرجات والإلغاء وسلوك XSRF.
- تجمع [الأمثلة](/ar/guide/examples) هذه العقود في وصفات يملك التطبيق دورة حياتها.
