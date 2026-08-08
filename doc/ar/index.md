---
layout: home

hero:
  name: Defjs
  text: أوامر مضبوطة الأنواع لـ HTTP وSSE وWebSocket
  tagline: عرّف أشكال البيانات المنقولة باستخدام Structs، وأنشئ عملاء صريحين، وأبقِ نتيجة كل وسيلة نقل ودلالات دورة حياتها واضحة.
  actions:
    - theme: brand
      text: ابدأ هنا
      link: /ar/guide/getting-started
    - theme: alt
      text: عرض على GitHub
      link: https://github.com/defjs/defjs

features:
  - title: عقود نقاط النهاية
    details: افصل بين تعريف نقطة النهاية ومنشئ الأمر وقيمة الأمر. تفك Structs ترميز مدخلات المستدعي وبيانات النقل بنيويًا وقت التشغيل.
  - title: نتائج خاصة بكل وسيلة نقل
    details: تستخدم HTTP وSSE وWebSocket جميعًا tuple يبدأ بالخطأ ويتكون من ثلاثة عناصر، ويكون العنصر الثالث غلاف استجابة أو لقطة فتح عند البدء أو لقطة اتصال عند البدء.
  - title: سلاسل المعترضات
    details: سجّل معترضات HTTP وSSE وWebSocket على العميل. ترشّح كل وسيلة نقل معترضاتها وتشغّلها بترتيب البصلة.
  - title: دورة حياة صريحة
    details: يستطيع SSE إعادة محاولة أخطاء الشبكة والقراءة. إعادة اتصال WebSocket اختيارية. ويبقى التطبيق مسؤولًا عن التكرار والإلغاء والإغلاق النهائي.
  - title: فك الترميز وقت التشغيل
    details: فك ترميز input وresponses وstream events وWebSocket messages بعقود Struct نفسها التي تقود TypeScript inference.
  - title: تكاملات التطبيق
    details: شارك clients عبر Vue أو React، وأضف outbound OpenTelemetry instrumentation في خدمات الخادم.
---

## أنشئ Client API مضبوط النوع

ابدأ بوصف عقد HTTP أو SSE أو WebSocket الذي يستدعيه تطبيقك. يحوّل Defjs هذا التعريف إلى command builder، ويتحقق من البيانات وقت التشغيل، ويُبقي نتيجة transport واضحة.

مسار HTTP الأساسي صغير: أنشئ client للـ API، وعرّف endpoint، واستدعِ command builder، ثم نفّذ command.

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

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

وجّه client إلى الخدمة التي يستعملها تطبيقك، واجعل Structs مطابقة لعقد response الفعلي. يظل تطبيقك مسؤولًا عن credentials وحالة UI وretries والإلغاء وتنظيف الموارد.

## تابع القراءة

- تبدأ صفحة [البدء](/ar/guide/getting-started) بالتثبيت وأول request مضبوط النوع داخل تطبيقك.
- تشرح صفحة [Client](/ar/core/client) تركيب options والأشكال الثلاثة لـ `execute`.
- تعرّف صفحة [Commands](/ar/core/commands) endpoints وcommand builders وcommands وschema-bound projections.
- توثّق صفحات [HTTP](/ar/core/http) و[SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) سلوك transports وملكية lifecycle.
- توضّح صفحات [Vue](/ar/plugins/vue) و[React](/ar/plugins/react) و[OpenTelemetry Server](/ar/plugins/opentelemetry-server) ربط Defjs بإطار تطبيقك وإعداد telemetry.
