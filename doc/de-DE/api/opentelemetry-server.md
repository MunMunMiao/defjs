---
title: '@defjs/opentelemetry-server'
description: 'Outbound-Instrumentierung: `withOpenTelemetryServer`.'
---

# OpenTelemetry server {#page}

Mach Outbound-Instrumentierung an, wenn du den Client baust. Hängt HTTP-, SSE- und WebSocket-Interceptor an. Das ist **keine** eingehende Server-Instrumentierung und startet **kein** OpenTelemetry-SDK.

Sieh den [OpenTelemetry-server-Guide](../plugins/opentelemetry-server.md).

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

Hängt pro aktivem Transport einen Interceptor an. Beim `createClient` drauflegen.

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` ist Pflicht. `meter` ist optional — weglassen, dann keine Paket-Metriken. Kein `propagator` → W3C Trace Context + Baggage.

HTTP, SSE und WebSocket sind standardmäßig an. `{ enabled: false }` überspringt einen Transport.

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

`startSpanHook` läuft für den jeweiligen HTTP-, SSE- oder WebSocket-Transport synchron vor der Span-Erzeugung. App-Attribute werden zuletzt angewandt und dürfen daher `url.full` überschreiben. Bei einem Throw zeichnet Defjs `defjs.otel.hook.error` auf und setzt den Request mit Built-in-Attributen fort; `requestHook` und `responseHook` bleiben nach der Span-Erzeugung.

Standardmäßig löst `url.full` nur `request.endpoint` gegen das optionale `request.baseEndpoint` auf und hängt kein separates `request.queryString` an. Das ist keine Redaction, und es gibt keine eingebaute Redactor-Policy. Erzeuge eine vollständige oder redigierte URL explizit in `startSpanHook`.

`queryPropagation` ist standardmäßig `false`. Nur einschalten, wenn Trace-Context in der WebSocket-URL ok ist.
