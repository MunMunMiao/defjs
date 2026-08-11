---
title: OpenTelemetry Server
description: أضف instrumentation لأعمال عملاء Defjs الصادرة في HTTP وSSE وWebSocket باستخدام Tracer يوفّره التطبيق وMeter اختياري.
---

# `@defjs/opentelemetry-server`

على الرغم من اسم الحزمة، يضيف هذا المحول instrumentation لأعمال عميل Defjs الصادرة. فهو ليس instrumentation للطلبات الواردة إلى الخادم، ولا يهيئ OpenTelemetry SDK.

يملك التطبيق:

- إعداد SDK وproviders؛
- إعداد exporters وprocessors؛
- context manager وإعداد active context؛
- sampling وسياسة attributes وحجب البيانات الحساسة؛
- force-flush وshutdown.

مرّر `Tracer` يوفّره التطبيق و`Meter` اختياريًا إلى `withOpenTelemetryServer(...)`.

## إعداد العميل

```typescript
import { createClient, defineRequest, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

يضيف المحول interceptor واحدًا لكل transport مفعّل. تعمل الخيارات بترتيب العميل المعتاد، لذلك يحدد موضعها بالنسبة إلى المعترضات الأخرى أي عمل تغلّفه spans.

### هوية العملية

عيّن `operation` بقيمة ثابتة في تعريف كل endpoint. فهي الهوية منخفضة cardinality التي تستخدمها spans وmetrics:

```typescript
const readOrder = defineRequest({
  method: 'GET',
  operation: 'orders.read',
  path: '/orders/:id',
  // input and output omitted
})
```

عند وجود operation تصبح أسماء spans مثل `GET orders.read` و`SSE orders.watch` و`WebSocket orders.connect`، وتُسجّل `defjs.operation`. عند غيابها يبقى fallback السابق: method لـ HTTP أو `SSE` أو `WebSocket` بلا صفة operation. لا تستنتج الهوية من resolved URL أو path يحوي identifiers، ولا تنسخ resolved URLs إلى telemetry أو logs.

## الخيارات

```typescript
interface OpenTelemetryServerOptions {
  tracer: Tracer
  meter?: Meter
  propagator?: TextMapPropagator
  requireParentSpan?: boolean
  http?: OpenTelemetryServerHttpOptions
  sse?: OpenTelemetryServerSSEOptions
  webSocket?: OpenTelemetryServerWebSocketOptions
}
```

يقبل خيار كل transport الحقل `enabled?: boolean` و`requestHook` و`responseHook`. وتقبل WebSocket أيضًا `queryPropagation?: boolean`.

تكون وسائل النقل الثلاث مفعلة افتراضيًا. استخدم option object لتعطيل واحدة:

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

تُرفض حقول transport المنطقية القديمة والـ hooks العلوية و`webSocketQueryPropagation` وقت التشغيل مع أخطاء migration. الأشكال الحالية هي transport option objects وhooks ضمن نطاق transport و`webSocket.queryPropagation`.

## نشر السياق

عند حذف `propagator`، تنشئ الحزمة `CompositePropagator` خاصًا بها يحتوي W3C Trace Context وW3C Baggage propagators. ولا تقرأ إعداد propagator العام.

تحقن HTTP وSSE كل حقل ينتجه propagator في request headers. إذا كانت `req.headers` كائن `Headers` أصلًا، يعيد التنفيذ الحالي استخدام الكائن نفسه ويعدّله مباشرة؛ وإلا ينشئ كائن `Headers` جديدًا. يكون WebSocket query propagation مساويًا لـ `false` افتراضيًا. ولا يحدث الحقن إلا عند ضبط `queryPropagation: true`؛ ولأن browser sockets لا تستطيع إضافة handshake headers اعتباطية، تُلحق عندئذ كل حقل ينتجه propagator بـ connection query string.

قبل إنشاء span، يستدعي كل interceptor أيضًا `propagator.extract(...)` على request headers. تعامل مع هذا carrier على أنه input موثوق يملكه التطبيق. لا تسمح لمصدر غير موثوق بإرسال `traceparent` أو `tracestate` أو `baggage`، لأن هذه الحقول قد تستبدل active parent context. احذف حقول النشر غير الموثوقة أو طبّعها قبل وصول الطلب إلى هذا interceptor.

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

راجع نشر URL قبل تمكين query propagation. قد تسجّل المتصفحات وproxies وaccess logs وأنظمة telemetry قيم trace context وbaggage، وقد يضيف custom propagator حقولًا أكثر من `traceparent`. فضّل first message جرى تدقيقه ضمن البروتوكول أو connection ticket قصيرة العمر وأحادية الاستخدام عندما يدعم الخادم أحدهما.

عندما تكون `requireParentSpan: true`، تبحث المعترضات عن active parent span قبل أي instrumentation. إذا لم يوجد، تتجاوز إنشاء span والنشر والـ hooks والـ metrics، ثم تستدعي handler التالي من دون تعديل.

## سلوك Hooks

تستقبل hooks الـ span والطلب أو النتيجة الخاصة بوسيلة النقل:

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response, request) {
      span.setAttribute('app.operation', request.operation ?? 'unclassified')
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

الوسيط الثالث هو كائن `HttpRequest` الأصلي للـ transport. استخدم `operation` الصريحة منه، ولا تعِد بناء الهوية من `request.endpoint` أو resolved URL أو path.

يمكن أن تعيد الـ hooks القيمة `void` أو `Promise<void>` وتظل غير حاجبة. يُلتقط كل من الرمي المتزامن والرفض غير المتزامن ويُسجل كـ `defjs.otel.hook.error` من دون إيقاف عملية العميل، كما تُعزل أخطاء تسجيل telemetry نفسها.

استخدم attributes من allowlist منخفضة cardinality. لا تُرفق headers أو query strings أو bodies أو baggage أو event IDs أو message payloads خامًا.

## دلالات HTTP

ينشئ HTTP interceptor span من نوع `SpanKind.CLIENT` ويسجل:

- الاسم `${method} ${operation}` والصفة `defjs.operation` عندما يعلن endpoint عن operation ثابتة؛
- method الطلب وحده كـ fallback سابق دون تغيير عند غياب operation؛
- `http.request.method`؛
- `url.full`؛
- `server.address` و`server.port` الاختياري؛
- `http.response.status_code` فقط عند استلام status فعلي لـ response.

لا يعني هذا توافقًا كاملًا مع HTTP semantic conventions.

يتبع status لـ HTTP span و`error.type` القواعد التالية:

- status من `100` إلى `399` يترك status لـ span غير معيّن ولا يضبط `error.type`؛
- status من `400` فما فوق يضع client span في `ERROR` ويضبط `error.type` على نص status code؛
- نتيجة transport من Defjs ذات status 0 لا تضبط `http.response.status_code`؛ يترك إلغاء caller الـ status غير معيّن ولا يضبط `error.type`، ويستخدم timeout القيمتين `ERROR` / `TIMEOUT`، وتستخدم إخفاقات transport الأخرى `ERROR` / `NETWORK_ERROR`؛
- error يُرمى عبر interceptor يضع span في `ERROR`، ويسجل exception، ويستخدم `Error.name` أو fallback آخر منخفض cardinality كـ `error.type`.

ينتهي HTTP span عندما يستقبل HTTP interceptor كائن `HttpResponse` من Defjs. يحدث توزيع output status عالي المستوى وفك Struct بعد عودة interceptor. لذلك لا يستطيع `RESPONSE_VALIDATION_FAILED` أو `UNDECLARED_STATUS` لاحق تحديث span الذي انتهى.

عند توفير Meter، تسجل HTTP المقياس `http.client.request.duration` بالثواني. تشمل attributes الـ method وserver address/port وresponse status الاختياري و`error.type` الاختياري. يطبق المقياس تصنيف response status و`error.type` نفسه الذي يطبقه HTTP span.

## دلالات SSE

بعد نجاح بدء SSE، يبقى span مفتوحًا حتى تستقر `stream.closed`. يسجل `sse.connected` ثم واحدًا من `sse.closed` أو `sse.aborted` أو `sse.error` في مسارات الإغلاق المغطاة.

عند توفير Meter، يستخدم SSE المقاييس التالية:

| المقياس                                | المعنى                                                              |
| -------------------------------------- | ------------------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | الوقت حتى إعادة مقبض stream المنطقي.                                |
| `defjs.client.sse.connection.duration` | الوقت من إعادة المقبض إلى الإغلاق النهائي.                          |
| `defjs.client.sse.active_streams`      | عدد المقابض المنطقية التي لم تستقر Promise الخاصة بـ `closed` فيها. |

هذه مقاييس مخصصة لـ Defjs. يشمل active counter الوقت بين محاولات reconnect الفعلية. ولا يعد اتصالات HTTP المفتوحة حاليًا.

## دلالات WebSocket

بعد نجاح البدء، يبقى WebSocket span مفتوحًا حتى تستقر `session.closed`. يسجل `websocket.connected` ثم `websocket.closed` أو `websocket.error` في المسارات المغطاة.

يستخدم WebSocket مع Meter المقاييس التالية:

| المقياس                                      | المعنى                                                              |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | الوقت حتى إعادة الجلسة المنطقية.                                    |
| `defjs.client.websocket.connection.duration` | الوقت من إعادة session إلى الإغلاق النهائي.                         |
| `defjs.client.websocket.active_connections`  | عدد الجلسات المنطقية التي لم تستقر Promise الخاصة بـ `closed` فيها. |

يقول اسم المقياس connections، لكن التنفيذ يعد الجلسات المنطقية، بما فيها فترات تأخير reconnect. ولا يعد physical sockets.

لا توجد هنا generic WebSocket semantic conventions مستقرة. لا تنشئ الحزمة span لكل رسالة ولا تسجل payloads أو queue lengths افتراضيًا.

## البيانات الحساسة وحدود التغطية

تُحل `url.full` الافتراضية من request endpoint وbase endpoint بدل serialized query string، لكن قد تظل paths المحلولة تحتوي identifiers حساسة. هذه transport metadata وليست مصدرًا لهوية operation. أبقِ `operation` ثابتة، ولا تنسخ resolved URLs إلى telemetry أو logs، واضبط redaction في SDK/exporter قبل تصدير URL attributes. وتضيف WebSocket propagation الحقول منفصلة إلى query string الفعلية.

تستقبل `recordException(...)` الأخطاء المرمية وبعض أسباب الإغلاق. قد تكشف رسائل الأخطاء وstacks بيانات حساسة. اضبط processors وحجب البيانات الحساسة على مستوى SDK وexporter وفقًا لذلك؛ لا ينقّح هذا المحول exceptions نيابة عن التطبيق.

قبل النشر، اختبر هذا adapter مع SDK وexporters وprocessors وcontext manager وautomatic instrumentation التي تستخدمها خدمتك. تحقّق من baggage من الطرف إلى الطرف، وحجب البيانات الحساسة، وshutdown/flush، وتكرار spans تحت traffic فعلي.

## التالي

- تشرح [المعترضات](/ar/core/interceptors) الترتيب حول معترضات العميل الأخرى.
- تشرح [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) أعمار المقابض والجلسات المنطقية التي تعدها هذه المقاييس.
