---
title: '@defjs/opentelemetry-server'
description: Outbound instrumentation option：`withOpenTelemetryServer`。
---

# OpenTelemetry server {#page}

Create client 嗰陣打開 outbound instrumentation。Append HTTP、SSE、WebSocket interceptors。**唔係** inbound server instrumentation，亦 **唔會** initialize OpenTelemetry SDK。

見 [OpenTelemetry server 指南](../plugins/opentelemetry-server.md)。

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

每個 enabled transport append 一條 interceptor。疊喺 `createClient`。

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` 必填。`meter` 可選——唔傳就唔記呢個 package 嘅 metrics。唔傳 `propagator` → W3C Trace Context + Baggage。

HTTP、SSE、WebSocket 預設開。某個 transport 傳 `{ enabled: false }` 就 skip。

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

`startSpanHook` 會喺相應 HTTP、SSE 或 WebSocket transport create span 之前同步 run。Return 嘅 attributes 會喺 built-in attributes 之後 apply，所以 application 可以 override `url.full` 或其他 initial value。Hook throw 時，Defjs 會用 built-in attributes create span、record `defjs.otel.hook.error`，再繼續個 request；`requestHook` 同 `responseHook` 保持 create span 之後先 run 嘅 semantics。

預設 `url.full` 淨係會將 `request.endpoint` resolve against optional `request.baseEndpoint`，唔會 append 獨立嘅 `request.queryString`。呢條 boundary 唔係 redaction；package 冇 built-in redactor 或 sensitive-key policy。要 explicit build application-owned URL，再按需要 delete sensitive params：

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

`queryPropagation` 預設 `false`。除非你接受將 trace context 放進 WebSocket URL，否則唔好開。
