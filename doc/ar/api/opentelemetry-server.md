---
title: '@defjs/opentelemetry-server'
description: 'أجهزة صادرة: `withOpenTelemetryServer`.'
---

# OpenTelemetry server {#page}

فعّل الأجهزة الصادرة عندما تنشئ العميل. يُلحق معترضات HTTP وSSE وWebSocket. **ليس** أجهزة خادم واردة، و**لا** يهيئ OpenTelemetry SDK.

انظر [دليل OpenTelemetry server](../plugins/opentelemetry-server.md).

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

يضيف معترضًا لكل نقل مفعّل. طبّقه عند `createClient`.

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` مطلوب. `meter` اختياري — احذفه لتخطي مقاييس الحزمة. بلا `propagator` → W3C Trace Context + Baggage.

HTTP وSSE وWebSocket مفعّلة افتراضيًا. `{ enabled: false }` يتخطى نقلًا.

## OpenTelemetryServerOptions {#OpenTelemetryServerOptions}

```ts
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

## OpenTelemetryServerTransportOptions {#OpenTelemetryServerTransportOptions}

```ts
interface OpenTelemetryServerTransportOptions<TResponse> {
  enabled?: boolean
  startSpanHook?: (request: HttpRequest) => Attributes
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, res: TResponse, req: HttpRequest) => Promise<void> | void
}

type OpenTelemetryServerHttpOptions = OpenTelemetryServerTransportOptions<HttpResponse<unknown>>
type OpenTelemetryServerSSEOptions = OpenTelemetryServerTransportOptions<EventStreamHandle<unknown>>
interface OpenTelemetryServerWebSocketOptions extends OpenTelemetryServerTransportOptions<WebSocketSessionLike> {
  queryPropagation?: boolean
}
```

يعمل `startSpanHook` بشكل متزامن قبل إنشاء span لوسيلة HTTP أو SSE أو WebSocket الخاصة به. تُطبّق سمات التطبيق أخيرًا، لذا يمكنها تجاوز `url.full`. إذا رمى، تسجّل Defjs `defjs.otel.hook.error` وتكمل الطلب بالسمات المدمجة؛ تبقى `requestHook` و`responseHook` بعد إنشاء span.

افتراضيًا، يحل `url.full` فقط `request.endpoint` مقابل `request.baseEndpoint` الاختياري ولا يضيف `request.queryString` مستقلًا. هذه ليست redaction ولا توجد سياسة redactor مدمجة. ابنِ URL كاملًا أو منقحًا في التطبيق عبر `startSpanHook`.

`queryPropagation` افتراضيًا `false`. فعّله فقط إن قبلت وضع سياق التتبع في عنوان WebSocket.
