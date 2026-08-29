---
title: '@defjs/opentelemetry-server'
description: withOpenTelemetryServer and per-transport options.
---

# OpenTelemetry server {#page}

Outbound HTTP / SSE / WebSocket instrumentation as core interceptors. This package does not initialize an OpenTelemetry SDK, and it is not inbound server instrumentation.

See the [OpenTelemetry server guide](/plugins/opentelemetry-server).

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

Appends one interceptor per enabled transport. Apply it at `createClient` time.

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` is required. `meter` is optional — omit it to skip package metrics. No `propagator` → W3C Trace Context + Baggage.

HTTP, SSE, and WebSocket are on by default. Pass `{ enabled: false }` on a transport to skip it.

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

`startSpanHook` runs synchronously before span creation for its own HTTP, SSE, or WebSocket transport. Its attributes are applied after built-in attributes, so the application may override `url.full` or another initial value. If it throws, Defjs creates the span with built-in attributes, records `defjs.otel.hook.error`, and continues the request; `requestHook` and `responseHook` keep their existing post-creation semantics.

By default, `url.full` resolves only `request.endpoint` against optional `request.baseEndpoint`; an independent `request.queryString` is not appended. That boundary is not redaction, and the package has no built-in redactor or sensitive-key policy. Construct and, if needed, redact an application-owned URL explicitly:

```ts
import { createResolvedRequestUrl, type HttpRequest } from '@defjs/core'
import type { Attributes } from '@opentelemetry/api'

const http = {
  startSpanHook(request: HttpRequest): Attributes {
    if (!request.baseEndpoint) return {}
    const url = createResolvedRequestUrl(request.baseEndpoint, request.endpoint)
    if (request.queryString) url.search = request.queryString
    url.searchParams.delete('access_token')
    return { 'url.full': url.href }
  },
}
```

`queryPropagation` defaults to `false`. Turn it on only after you accept trace context in the WebSocket URL.
