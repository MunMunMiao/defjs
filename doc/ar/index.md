---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: عرّف مرة واحدة. آمن الأنواع في كل مكان. HTTP، SSE، و WebSocket مع تحقق وقت التشغيل واستنتاج كامل لـ TypeScript.
  actions:
    - theme: brand
      text: البدء السريع
      link: /guide/getting-started
    - theme: alt
      text: عرض على GitHub
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: أمان الأنواع
    details: عرّف مخططات الطلب باستخدام struct. احصل على استنتاج الأنواع من النهاية إلى النهاية للمدخلات والمخرجات وفروع الخطأ. يقوم التحقق وقت التشغيل باعتراض التناقضات قبل أن تصل إلى الإنتاج.
  - icon: 🌐
    title: متعدد النقل
    details: أسلوب واجهة برمجة تطبيقات موحّد لطلبات HTTP و Server-Sent Events واتصالات WebSocket. بدّل وسائل النقل دون إعادة كتابة منطق تطبيقك.
  - icon: 🧅
    title: الاعتراضات
    details: اعتراضات بنموذج البصل لكل وسيلة نقل، لتسجيل الدخول والمصادقة وإعادة المحاولة والاهتمامات العابرة. يمتلك HTTP و SSE و WebSocket كل منها سلسلة اعتراض خاصة.
  - icon: 📡
    title: الدفق
    details: دعم أصلي لـ SSE و WebSocket مع إعادة اتصال تلقائية ونبضة قلب وطابور رسائل وضبط ضغط عكسي. مبني لتطبيقات الوقت الحقيقي.
  - icon: ⚡
    title: بيئة تشغيل عالمية
    details: يعمل في المتصفحات و Node.js و Bun و Deno. لا تحتاج إلى polyfills. ESM خالص مع صفر تبعيات وقت التشغيل للحزمة الأساسية.
  - icon: 🧩
    title: جاهز لإطار العمل
    details: تكاملات من الدرجة الأولى لـ Vue و React مع أنماط provideClient / injectClient / useClient. إضافة OpenTelemetry لقابلية المراقبة من جانب الخادم.
---

## البدء السريع

ثبّت `@defjs/core` مع مدير الحزم الذي تفضله:

::: code-group

```bash [npm]
npm install @defjs/core
```

```bash [yarn]
yarn add @defjs/core
```

```bash [pnpm]
pnpm add @defjs/core
```

```bash [bun]
bun add @defjs/core
```

:::

عِرّف طلبًا مكتوبًا وأنفّذه في ثلاثة أسطر:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())
if (!error) {
  console.log(user.id, user.name) // fully typed
}
```

## تكاملات إطار العمل

<div class="framework-grid">

### Vue

`@defjs/vue` يوفر `provideClient` كإضافة Vue و `injectClient` لـ Composition API لمشاركة عميل `@defjs/core` مكتوب الأنواع عبر تطبيقك.

[تعرّف على المزيد →](/plugins/vue)

### React

`@defjs/react` يوفر `ClientProvider` و `useClient` و option helpers لمشاركة عميل `@defjs/core` مكتوب الأنواع عبر شجرة مكونات React.

[تعرّف على المزيد →](/plugins/react)

</div>

## ما التالي

- [البدء السريع →](/guide/getting-started) — التثبيت، استخدام CDN، وأول طلب لك
- [المفاهيم الأساسية →](/core/client) — العميل، الأوامر، السياق، ومعالجة الأخطاء
- [أمثلة →](/guide/examples) — REST CRUD، إشعارات SSE، دردشة WebSocket، أنماط الاعتراض

<style>
.framework-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.framework-grid > div,
.framework-grid > h3 {
  margin: 0;
}
.framework-grid h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.framework-grid p {
  margin: 0 0 0.5rem;
  color: var(--vp-c-text-2);
}
.framework-grid a {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>
