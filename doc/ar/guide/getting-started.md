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

اختُبرت تطبيقات HTTP المستهلكة لحزمة ESM بعد تجميعها على Node.js 22 و24 و26، وBun 1.3.14، وDeno 2.9.5. وبعد تجميع تطبيقك، تكون أشكال الأوامر المقابلة:

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

يستخدم أمر Deno الحزم المثبتة مسبقًا في `node_modules`؛ استبدل إذن الشبكة بأسماء مضيفي API الدقيقة التي يحتاجها تطبيقك. تغطي اختبارات Bun وDeno جزء HTTP الموثق، وليس كل platform API أو transport. تستخدم تطبيقات المتصفح bundler المعتاد وقدرات Fetch وWebSocket المطلوبة من المنصة.

ينبغي أن تتحقق الاختبارات عبر بيئات التشغيل من حقول Defjs المستقرة مثل `error.kind` و`error.code`. لا تعتمد على رسائل `Error` الأصلية الخاصة بالمحرك أو نص أخطاء تحليل JSON؛ فقد تنسّق Node.js وBun وDeno هذه التفاصيل بصورة مختلفة.

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
  ],
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

### تُحفظ قيم status الحرفية تلقائيًا

تستخدم `defineRequest(...)` ‏const generic لـ `output`، لذلك تحتفظ عناصر المصفوفة المضمّنة ومصفوفات status المجمّعة بقيمها الحرفية تلقائيًا. لا تحتاج إلى `as const` للفصل في الأنواع المستنتجة بين أجسام نجاح 2xx وأجسام أخطاء non-2xx.

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
