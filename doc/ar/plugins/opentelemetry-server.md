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

## التثبيت

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

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
| `queryPropagation` | `boolean`                 | `true`      | حقن سياق التتبع في سلسلة استعلام URL لـ WebSocket                          |
| `requestHook`      | `(span, req) => void`     | `undefined` | تخصيص span WebSocket قبل طلب الاتصال                                       |
| `responseHook`     | `(span, session) => void` | `undefined` | تخصيص span WebSocket بعد إرجاع الجلسة، `session` هو `WebSocketSessionLike` |

> **معالجة استثناء Hook**: إذا رمى `requestHook` أو `responseHook`، يُسجّل الخطأ على حدث `defjs.otel.hook.error` في الـ span، لكن الطلب/الدفق/الجلسة **يستمر بشكل طبيعي**.

## الاتفاقيات الدلالية والمقاييس لـ HTTP

يتبع تتبع HTTP اتفاقيات دلائية مستقرة لعميل HTTP في OpenTelemetry. افتراضيًا، يسجل span من نوع `SpanKind.CLIENT` مع السمات منخفضة البطاقة التالية:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

عند توفير `meter`، يُجمع المقاييس المستقرة التالية:

| المقياس                        | الوحدة | السمات                                                                                                                            |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`    | `http.request.method`، اختياري `http.response.status_code`، اختياري `server.address`، اختياري `server.port`، اختياري `error.type` |

افتراضيًا، **لا يُجمع أجسام الطلب/الاستجابة، ولا جميع الرؤوس، ولا سلاسل الاستعلام الخام، ولا أحجام الحمولات، ولا تفاصيل أحداث الشبكة**. هذه عادةً عالية البطاقة أو حساسة. أضفها صراحة عبر `requestHook` / `responseHook` إذا لزم الأمر.

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

عميلو WebSocket في المتصفح عادةً لا يمكنهم ضبط رؤوس HTTP تعسفية، لذا تُحقن هذه الحزمة افتراضيًا سياق التتبع في سلسلة استعلام URL لـ WebSocket لتوافق المتصفح.

لهذا الاختيار مقايضة أمنية: قد تظهر سلاسل الاستعلام في سجلات الوصول، وسجلات الوكيل، وأدوات تصحيح المتصفح/الشبكة، وحقول URL في APM. إذا كان الـ propagator يتضمن `baggage`، تُكتب قيم baggage أيضًا إلى URL، مما قد يحمل بيانات حساسة.

للتدفقات WebSocket الحساسة أمنيًا، عطل نشر الاستعلام صراحة:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

بعد التعطيل، لم يعد سياق التتبع يُنتشر عبر URL. يجب على الخادم الاعتماد على آليات أخرى لترابط التتبع (مثلاً، حقول معرّف التتبع في بروتوكول الرسالة على مستوى التطبيق).

## ما التالي

- [العميل](/core/client) — `createClient` وإعداد النقل الكامل
- [SSE](/core/sse) — `defineEventStream` واستهلاك أحداث الدفق
- [WebSocket](/core/web-socket) — `defineWebSocket` والتواصل في الوقت الحقيقي
