---
title: '@defjs/opentelemetry-server'
description: 'Instrumentación de salida: `withOpenTelemetryServer`.'
---

# OpenTelemetry server {#page}

Enciende la instrumentación de salida al crear el cliente. Añade interceptors HTTP, SSE y WebSocket. **No** es instrumentación de servidor de entrada, y **no** inicializa un SDK de OpenTelemetry.

Mira la [guía de OpenTelemetry server](../plugins/opentelemetry-server.md).

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

Añade un interceptor por transporte activo. Aplícalo en `createClient`.

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` es obligatorio. `meter` es opcional — si lo omites, no hay metrics del paquete. Sin `propagator` → W3C Trace Context + Baggage.

HTTP, SSE y WebSocket van on por defecto. `{ enabled: false }` salta un transporte.

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

`startSpanHook` se ejecuta de forma síncrona antes de crear el span de su transporte HTTP, SSE o WebSocket. Los atributos de la aplicación se aplican al final, así que pueden sobrescribir `url.full`. Si lanza, Defjs registra `defjs.otel.hook.error` y continúa la solicitud con los atributos incorporados; `requestHook` y `responseHook` siguen ejecutándose tras crear el span.

Por defecto, `url.full` solo resuelve `request.endpoint` contra el `request.baseEndpoint` opcional y no añade un `request.queryString` independiente. Ese límite no es redaction y no hay una política redactor incorporada. Construye explícitamente una URL completa o redactada en `startSpanHook`.

`queryPropagation` vale `false` por defecto. Actívalo solo si te vale meter trace context en la URL de WebSocket.
