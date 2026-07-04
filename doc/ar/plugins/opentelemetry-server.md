---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

حزمة تكامل OpenTelemetry من جانب الخادم، توفر جمع تتبع وقياس الصادرات لعملاء HTTP و SSE و WebSocket في `@defjs/core`.

**الموقع الأساسي**:

- **بيئة الخادم** (Node.js، Bun، Deno)، لا تعتمد على بيئة المتصفح.
- **لا تُهيئ SDK** — يجب عليك تهيئة SDK لـ OpenTelemetry خارجيًا، ثم تمرير الـ `Tracer` المُنشأ (واختياريًا `Meter`).
- **فصل لكل وسيلة نقل** — HTTP و SSE و WebSocket لكل منها اعتراضات مستقلة، ودورات حياة span، وأبعاد مقياس.

## إعداد مساحة عمل المستودع

توضح هذه الصفحة حاليًا استخدام source/workspace داخل هذا المستودع. يقع `@defjs/opentelemetry-server` في `packages/opentelemetry-server`، وتعتمد peer dependency الخاصة به على نسخة workspace المطابقة من `@defjs/core` داخل `packages/core`.

تستخدم محددات الاستيراد أدناه أسماء الحزم، لكنها داخل هذا المستودع تُحل إلى حزم المصدر في الـ workspace، لا إلى زوج حزم منشور في registry. واصل تثبيت حزم OpenTelemetry SDK الخاصة بتطبيقك وتهيئتها بشكل منفصل.

لا يوفر npm العام حاليًا `@defjs/opentelemetry-server`، كما أن أحدث إصدار مستقل من `@defjs/core` المتاح هناك ليس peer متوافقًا مع حزمة الـ workspace هذه. إذا نشرت لاحقًا كلاً من `@defjs/opentelemetry-server` وإصدارًا متوافقًا من `@defjs/core` إلى registry تتحكم بها أو إلى registry أخرى توفر الإصدارين معًا، فقم بتثبيت هذين الإصدارين المنشورين معًا في تلك البيئة بدلًا من خلط حزمة الـ workspace هذه مع إصدار مستقل غير متوافق من `@defjs/core`.

## الاستخدام الأساسي

مرر `Tracer` مُنشأ خارجيًا واضبط العميل عبر `withOpenTelemetryServer`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. تهيئة SDK لـ OpenTelemetry خارجيًا، ثم الحصول على tracer
const tracer = trace.getTracer('my-service')

// 2. حقن tracer في إعداد العميل
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## الإعداد الكامل

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // مطلوب
    meter, // اختياري، لا يُجمع المقاييس إلا عند توفيرها
    propagator, // اختياري، افتراضي W3C TraceContext + Baggage
    requireParentSpan: false,
    http: {
      enabled: true,
      requestHook(span, req) {
        span.setAttribute('defjs.operation', req.endpoint)
      },
      responseHook(span, res) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false,
    },
  }),
)
```

### خيارات الإعداد

| الخيار              | النوع                                 | الافتراضي                  | الوصف                                            |
| ------------------- | ------------------------------------- | -------------------------- | ------------------------------------------------ |
| `tracer`            | `Tracer`                              | **مطلوب**                  | tracer خارجي لـ OpenTelemetry                    |
| `meter`             | `Meter`                               | `undefined`                | meter خارجي لـ OpenTelemetry، حذفه يعطل المقاييس |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | propagator سياق مخصص                             |
| `requireParentSpan` | `boolean`                             | `false`                    | إنشاء span صادر فقط عند وجود span أصل نشط        |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | خيارات تتبع/مقياس نقل HTTP                       |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | خيارات تتبع/مقياس نقل SSE                        |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | خيارات تتبع/مقياس نقل WebSocket                  |

### خيارات HTTP

| الخيار         | النوع                 | الافتراضي   | الوصف                                                           |
| -------------- | --------------------- | ----------- | --------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | تمكين تتبع HTTP                                                 |
| `requestHook`  | `(span, req) => void` | `undefined` | تخصيص span HTTP قبل الطلب، `req` هو `HttpRequest`               |
| `responseHook` | `(span, res) => void` | `undefined` | تخصيص span HTTP بعد الاستجابة، `res` هو `HttpResponse<unknown>` |

### خيارات SSE

| الخيار         | النوع                    | الافتراضي   | الوصف                                                                         |
| -------------- | ------------------------ | ----------- | ----------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | تمكين تتبع SSE                                                                |
| `requestHook`  | `(span, req) => void`    | `undefined` | تخصيص span SSE قبل طلب الدفق                                                  |
| `responseHook` | `(span, stream) => void` | `undefined` | تخصيص span SSE بعد إرجاع مقبض الدفق، `stream` هو `EventStreamHandle<unknown>` |

### خيارات WebSocket

| الخيار             | النوع                     | الافتراضي   | الوصف                                                                      |
| ------------------ | ------------------------- | ----------- | -------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | تمكين تتبع WebSocket                                                       |
| `queryPropagation` | `boolean`                 | `true`      | حقن سياق التتبع في سلسلة استعلام URL لـ WebSocket لتوافق المتصفح. ولحركة إنتاج حساسة أمنيًا، فالخط الأساسي الموصى به هو ضبطه صراحةً على `false`. |
| `requestHook`      | `(span, req) => void`     | `undefined` | تخصيص span WebSocket قبل طلب الاتصال                                       |
| `responseHook`     | `(span, session) => void` | `undefined` | تخصيص span WebSocket بعد إرجاع الجلسة، `session` هو `WebSocketSessionLike` |

> **معالجة استثناء Hook**: إذا رمى `requestHook` أو `responseHook`، يُسجّل الخطأ على حدث `defjs.otel.hook.error` في الـ span، لكن الطلب/الدفق/الجلسة **يستمر بشكل طبيعي**.
>
> **نظافة السمات**: في `requestHook` / `responseHook`، فضّل allowlists صريحة وredaction وسمات مستقرة منخفضة البطاقة. لا تُرفق سلاسل الاستعلام الخام أو أجسام الطلب/الاستجابة أو الرؤوس الكاملة أو قيم `baggage` أو حمولات الرسائل ما لم يكن تطبيقك قد راجع بالفعل متطلبات الخصوصية والبطاقة والاحتفاظ وredaction.

## الترحيل من الـ API القديم

| الإعداد القديم             | الإعداد الجديد                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| `http: false`             | `http: { enabled: false }`                                       |
| `sse: false`              | `sse: { enabled: false }`                                        |
| `webSocket: false`        | `webSocket: { enabled: false }`                                  |
| `requestHook`             | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook` |
| `responseHook`            | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                   |

أزيلت الـ hooks ذات المستوى الأعلى ومفاتيح التبديل المنطقية للنقل عمدًا حتى يعرّض كل وسيلة نقل أنواع الطلب/الاستجابة الصحيحة. وتمرير هذه الخيارات القديمة المحذوفة من JavaScript يؤدي الآن إلى خطأ ترحيل بدلًا من تفسيرها بصمت على أنها instrumentation مفعلة.

## الاتفاقيات الدلالية والمقاييس لـ HTTP

يتبع تتبع HTTP اتفاقيات دلائية مستقرة لعميل HTTP في OpenTelemetry. افتراضيًا، يسجل span من نوع `SpanKind.CLIENT` مع السمات الأساسية التالية:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

عند توفير `meter`، يُجمع المقاييس المستقرة التالية:

| المقياس                        | الوحدة | السمات                                                                                                                            |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`    | `http.request.method`، اختياري `http.response.status_code`، اختياري `server.address`، اختياري `server.port`، اختياري `error.type` |

افتراضيًا، **لا تضيف هذه الحزمة أجسام الطلب/الاستجابة أو الرؤوس الكاملة أو قيم `baggage` أو أحجام الحمولات أو حمولات الرسائل كحقول قياس مخصصة**. كما أنها **لا تنشئ سمات span أو مقاييس منفصلة لسلاسل الاستعلام الخام**. لكن `url.full` يعكس URL الذي يبنيه تطبيقك فعليًا، لذا إذا كان الـ URL نفسه يتضمن سلسلة استعلام فقد تظهر هناك أيضًا. تجنب قدر الإمكان وضع tokens أو user ids أو أي مدخلات حساسة أو عالية البطاقة في عناوين URL.

لا تضف سلاسل الاستعلام الخام أو أجسام الطلب/الاستجابة أو الرؤوس الكاملة أو قيم `baggage` أو حمولات الرسائل إلى spans أو المقاييس ما لم يكن التطبيق قد راجع بالفعل متطلبات الخصوصية والبطاقة والاحتفاظ وredaction. وعند توسيع القياس عبر hooks، فضّل allowlists صريحة وredaction وسمات مستقرة منخفضة البطاقة.

## تتبع مستوى الاتصال SSE والمقاييس المخصصة

SSE هو استجابة HTTP طويلة العمر. تنتهي مدة طلب HTTP العادي عند إنشاء الدفق، وهذا لا يعكس ما إذا كان الدفق لا يزال يعمل أو مُقاطعًا أو به خطأ. لذلك، تعامل هذه الحزمة SSE كـ **قياس مستوى الاتصال**.

### دورة حياة Span

يبقى span الخاص بـ SSE مفتوحًا حتى يُحلّ `stream.closed`، ويسجل أحداث دورة الحياة التالية:

- `sse.connected` — تم إنشاء الدفق بنجاح
- `sse.closed` — انتهاء الدفق بشكل طبيعي (EOF من الخادم)
- `sse.aborted` — إغلاق فعّال عبر `stream.close()`
- `sse.error` — خطأ اتصال أو استنفاد إعادة الاتصال

### المقاييس المخصصة

عند توفير `meter`، يُجمع المقاييس المخصصة التالية لـ defjs (ليست اتفاقيات دلائية مستقرة رسمية لـ OpenTelemetry):

| المقياس                                | الوحدة     | المعنى                                           |
| -------------------------------------- | ---------- | ------------------------------------------------ |
| `defjs.client.sse.connect.duration`    | `s`        | الوقت لإنشاء اتصال الدفق                         |
| `defjs.client.sse.connection.duration` | `s`        | المدة الإجمالية من إنشاء الدفق إلى الإغلاق/الخطأ |
| `defjs.client.sse.active_streams`      | `{stream}` | عدد دفقات SSE النشطة الحالية                     |

افتراضيًا، **لا يُنشأ span لكل حدث**، و**لا يُجمع حمولات الأحداث أو معرّفات الأحداث أو `Last-Event-ID` أو زمن التسليم أو الأحداث المفقودة أو طوابور إعادة الاتصال**. هذه دلالات على مستوى التطبيق قد تُنتج قياسًا عالي البطاقة أو حساسًا. نفّذها على مستوى التطبيق إذا لزم الأمر.

## تتبع مستوى الاتصال WebSocket والمقاييس المخصصة

يبدأ WebSocket بمصافحة HTTP Upgrade، لكن بيئات الإنتاج تهتم أكثر بدورة الحياة بعد المصافحة: الاتصالات النشطة، مدة الاتصال، سلوك الإغلاق/الخطأ، ومعدل فشل الاتصال. بما أن اتفاقيات WebSocket الدلائية في OpenTelemetry لم تستقر بعد، تستخدم هذه الحزمة مقاييس مخصصة على مستوى الاتصال.

### دورة حياة Span

يبقى span الخاص بـ WebSocket مفتوحًا حتى يُحلّ `session.closed`، ويسجل أحداث دورة الحياة التالية:

- `websocket.connected` — تم إنشاء الجلسة بنجاح
- `websocket.closed` — إغلاق الاتصال بشكل طبيعي
- `websocket.error` — خطأ اتصال

### المقاييس المخصصة

عند توفير `meter`، يُجمع المقاييس المخصصة التالية لـ defjs:

| المقياس                                      | الوحدة         | المعنى                                            |
| -------------------------------------------- | -------------- | ------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | الوقت لإنشاء جلسة WebSocket                       |
| `defjs.client.websocket.connection.duration` | `s`            | المدة الإجمالية من إنشاء الجلسة إلى الإغلاق/الخطأ |
| `defjs.client.websocket.active_connections`  | `{connection}` | عدد اتصالات WebSocket النشطة الحالية              |

افتراضيًا، **لا يُنشأ span لكل رسالة**، و**لا يُجمع حمولات الرسائل أو أحجامها أو الضغط العكسي أو المبلغ المخزن مؤقتًا أو البروتوكولات الفرعية أو طوابور إعادة الاتصال**. يجب تنفيذ القياس على مستوى الرسالة على مستوى التطبيق مع استراتيجيات أخذ العينات.

## مخاطر أمان نشر WebSocket عبر الاستعلام

لا يستطيع عملاء WebSocket في المتصفح عادةً ضبط رؤوس HTTP عشوائية، لذلك تكون القيمة الافتراضية وقت التشغيل لـ `webSocket.queryPropagation` هي `true` من أجل التوافق. وهذه القيمة الافتراضية تحقن سياق التتبع في سلسلة استعلام URL الخاصة بـ WebSocket.

قد تُسجل سلاسل الاستعلام بواسطة الوكلاء والمتصفحات وأدوات APM وسجلات الوصول وأدوات تصحيح الشبكة. وقد تحتوي أيضًا على tokens أو user ids أو مدخلات أخرى عالية البطاقة. وإذا كان الـ propagator يتضمن `baggage`، فقد تُكتب قيم `baggage` أيضًا في الـ URL وتحمل بيانات حساسة.

بالنسبة لحركة WebSocket الإنتاجية الحساسة أمنيًا، عطّل نشر الاستعلام صراحةً باعتباره الخط الأساسي الأمني الموصى به:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

بعد التعطيل، لن يعود سياق التتبع ينتقل عبر URL الخاص بـ WebSocket. وإذا كان الخادم لا يزال بحاجة إلى ربط الاتصال بتتبع، فاستخدم على مستوى التطبيق آلية ترابط أخرى تمت مراجعتها بالفعل.

## ما التالي

- [العميل](/core/client) — `createClient` وإعداد النقل الكامل
- [SSE](/core/sse) — `defineEventStream` واستهلاك أحداث الدفق
- [WebSocket](/core/web-socket) — `defineWebSocket` والتواصل في الوقت الحقيقي
