# @defjs/opentelemetry-server

Server-side outbound OpenTelemetry integration for `@defjs/core` HTTP, SSE, and WebSocket clients.

**Core Positioning**:

- **Outbound-only client instrumentation** — This package wraps defjs clients that make outbound requests. It is not inbound server instrumentation.
- **Server environment** — Designed for server-side applications with an OpenTelemetry SDK, not browser-only telemetry setup.
- **Does not initialize the SDK** — This package does not initialize an OpenTelemetry SDK. Register a `TracerProvider` (`setGlobalTracerProvider`, or your SDK's `start()`) then pass that tracer (and optional meter) into `withOpenTelemetryServer(...)`. `trace.getTracer(...)` with no provider is a silent no-op.
- **Per-transport separation** — HTTP, SSE, and WebSocket each have independent interceptors, span lifecycles, and metric dimensions.

## Installation

Install `@defjs/opentelemetry-server` with the matching `@defjs/core` release line and its OpenTelemetry peers:

```sh
bun add @defjs/core @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

The package is ESM and requires `@defjs/core` as a peer in the `^0.4.0` range. Its tarball retains this `README.md` and the repository `LICENSE`; repository-wide guides and examples remain outside the package.

Initialize your application's OpenTelemetry SDK separately so a `TracerProvider` is registered. The package provides interceptors and consumes the tracer you pass; it does not emit spans on its own.

## Basic Usage

This package does not install a `TracerProvider`. `trace.getTracer('my-service')` without `trace.setGlobalTracerProvider(...)` (your SDK's `start()` usually does this) returns a no-op tracer: interceptors still wrap requests, but spans are silently discarded. Pass a recording tracer from your SDK, or register the provider first:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// After your OpenTelemetry SDK has called setGlobalTracerProvider:
const tracer = trace.getTracer('my-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
  }),
)
```

## Operation Identity

Set the optional `operation` field statically on `defineRequest(...)`, `defineEventStream(...)`, or `defineWebSocket(...)`:

```typescript
const readOrder = defineRequest({
  method: 'GET',
  operation: 'orders.read',
  path: '/orders/:id',
  // input and output omitted
})
```

An explicit operation is the low-cardinality transport identity. HTTP spans use names such as `GET orders.read`; SSE and WebSocket spans use `SSE orders.watch` and `WebSocket orders.connect`. Spans and metrics also receive `defjs.operation`.

Without `operation`, the previous fallback remains unchanged: HTTP uses the request method as its span name, SSE uses `SSE`, WebSocket uses `WebSocket`, and `defjs.operation` is omitted. Never infer an operation from `req.endpoint`, a resolved URL, or a path containing identifiers. Do not copy resolved URLs into custom attributes or logs.

## Full Configuration

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // Required
    meter, // Optional, metrics only collected when provided
    propagator, // Optional, default W3C TraceContext + Baggage
    requireParentSpan: false,
    http: {
      enabled: true,
      startSpanHook(req) {
        return { 'app.operation': req.operation ?? 'unclassified' }
      },
      responseHook(span, res, req) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false, // Safe default; set true only after reviewing URL propagation
    },
  }),
)
```

## WebSocket propagation safety

`webSocket.queryPropagation` defaults to `false`. Omitting it leaves the WebSocket query string unchanged and does not inject trace context or baggage into the URL.

Browser WebSocket clients usually cannot set arbitrary headers. If you have reviewed URL-based propagation for your environment and accept its exposure boundary, enable it explicitly:

```ts
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

Query strings can be recorded by proxies, browsers, APM tooling, access logs, and network debugging tools. They may also contain tokens or other high-cardinality user input. If your propagator includes `baggage`, baggage values can also be written into the URL and may contain sensitive data.

With the safe default, trace context does not ride on the WebSocket URL. Use another reviewed correlation mechanism at the application layer, such as a protocol-reviewed first frame or a short-lived connection ticket, if your server still needs to link the connection to a trace.

### Configuration Options

| Option              | Type                                  | Default                    | Description                                                  |
| ------------------- | ------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `tracer`            | `Tracer`                              | **Required**               | External OpenTelemetry tracer                                |
| `meter`             | `Meter`                               | `undefined`                | External OpenTelemetry meter, omitting disables metrics      |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Custom context propagator                                    |
| `requireParentSpan` | `boolean`                             | `false`                    | Only create outbound spans when an active parent span exists |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP transport trace/metric options                          |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE transport trace/metric options                           |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket transport trace/metric options                     |

### HTTP Options

| Option          | Type                                        | Default     | Description                                                                    |
| --------------- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `enabled`       | `boolean`                                   | `true`      | Enable HTTP tracing                                                            |
| `startSpanHook` | `(req) => Attributes`                       | `undefined` | Add or override synchronous initial attributes before the HTTP span is created |
| `requestHook`   | `(span, req) => void \| Promise<void>`      | `undefined` | Customize HTTP span before request, `req` is `HttpRequest`                     |
| `responseHook`  | `(span, res, req) => void \| Promise<void>` | `undefined` | Customize HTTP span after response; `req` is the original `HttpRequest`        |

### SSE Options

| Option          | Type                                           | Default     | Description                                                                          |
| --------------- | ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `enabled`       | `boolean`                                      | `true`      | Enable SSE tracing                                                                   |
| `startSpanHook` | `(req) => Attributes`                          | `undefined` | Add or override synchronous initial attributes before the SSE span is created        |
| `requestHook`   | `(span, req) => void \| Promise<void>`         | `undefined` | Customize SSE span before stream request                                             |
| `responseHook`  | `(span, stream, req) => void \| Promise<void>` | `undefined` | Customize SSE span after stream handle returned; `req` is the original `HttpRequest` |

### WebSocket Options

| Option             | Type                                            | Default     | Description                                                                                                                         |
| ------------------ | ----------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                                       | `true`      | Enable WebSocket tracing                                                                                                            |
| `queryPropagation` | `boolean`                                       | `false`     | Inject trace context and baggage into the WebSocket URL query string. Enable only after reviewing URL logging and disclosure risks. |
| `startSpanHook`    | `(req) => Attributes`                           | `undefined` | Add or override synchronous initial attributes before the WebSocket span is created                                                 |
| `requestHook`      | `(span, req) => void \| Promise<void>`          | `undefined` | Customize WebSocket span before connection request                                                                                  |
| `responseHook`     | `(span, session, req) => void \| Promise<void>` | `undefined` | Customize WebSocket span after session returned; `req` is the original `HttpRequest`                                                |

> **Hook timing and failures**: `startSpanHook(request)` is synchronous and runs before span creation. Its attributes are applied after built-in attributes. If it throws, Defjs creates the span with built-in attributes, records `defjs.otel.hook.error`, and the client request/stream/session continues normally. `requestHook` and `responseHook` run after creation and may return `void` or `Promise<void>`; their throws/rejections are recorded without blocking the operation.
>
> Each `responseHook` receives the original transport `HttpRequest` as its third argument. Read its explicit `operation`; do not reconstruct identity from its endpoint or a resolved URL.
>
> **Attribute hygiene**: This package has no built-in redactor or sensitive-key policy. Prefer explicit allowlists, application-owned redaction, and stable low-cardinality attributes in hooks. Do not attach resolved URLs, raw query strings, request or response bodies, full headers, baggage values, or message payloads unless your application has already reviewed privacy, cardinality, retention, and redaction requirements.

## HTTP Semantic Conventions and Metrics

HTTP tracing uses stable OpenTelemetry HTTP client attribute and metric names. This is not a claim of complete semantic-convention compliance. With an explicit operation, the interceptor creates a `SpanKind.CLIENT` span named `${method} ${operation}` and records `defjs.operation`. Without one, it preserves the previous method-only span name and omits that attribute. It also records:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code` only when a response status was received

HTTP span status and `error.type` follow these rules:

- status `100` through `399` leaves span status unset and does not set `error.type`;
- status `400` and above marks the client span `ERROR` and sets `error.type` to the status code string;
- a Defjs status-0 transport result does not set `http.response.status_code`; caller cancellation leaves status unset, timeout uses `ERROR` / `TIMEOUT`, and other transport failures use `ERROR` / `NETWORK_ERROR`;
- an error thrown through the interceptor marks the span `ERROR`, records the exception, and uses its `Error.name` or another low-cardinality type fallback as `error.type`.

In the current implementation, `url.full` is resolved from `req.endpoint` and the optional `req.baseEndpoint`; it does not append `req.queryString`. This is an implementation boundary, not sanitization, an identity source, or a guarantee that URLs are safe. Applications that need a complete or redacted URL can override the initial value explicitly:

```ts
import { createResolvedRequestUrl } from '@defjs/core'

withOpenTelemetryServer({
  tracer,
  http: {
    startSpanHook(req) {
      if (!req.baseEndpoint) return {}
      const url = createResolvedRequestUrl(req.baseEndpoint, req.endpoint)
      if (req.queryString) url.search = req.queryString
      url.searchParams.delete('access_token')
      return { 'url.full': url.href }
    },
  },
})
```

Resolved paths can contain sensitive or high-cardinality identifiers. Keep operation names static and apply application or SDK/exporter redaction before exporting URL attributes.

When `meter` is provided, the following stable metrics are collected:

| Metric                         | Unit | Attributes                                                                                                                                      |
| ------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, optional `defjs.operation`, `server.address`, `server.port`, optional `http.response.status_code`, optional `error.type` |

The metric applies the same response-status and `error.type` classification as the HTTP span.

### Transport span boundary

The HTTP span ends when the interceptor receives the Defjs `HttpResponse`. Exact output-status dispatch and Struct decoding happen afterward, so a later `RESPONSE_VALIDATION_FAILED` or `UNDECLARED_STATUS` cannot update that transport span.

When telemetry must represent the final command outcome, create an application span around `client.execute(...)` and classify the returned tuple:

```ts
import { SpanStatusCode } from '@opentelemetry/api'

const outcome = await tracer.startActiveSpan('defjs.command', async (span) => {
  try {
    const outcome = await client.execute(command)
    const [error] = outcome
    if (error) {
      span.setAttribute('error.type', error.code)
      span.setStatus({ code: SpanStatusCode.ERROR })
    }
    return outcome
  } catch (error) {
    span.setAttribute('error.type', error instanceof Error ? error.name : typeof error)
    span.setStatus({ code: SpanStatusCode.ERROR })
    throw error
  } finally {
    span.end()
  }
})
```

This outer span is application-owned command telemetry; the plugin continues to emit only its lower-level transport span.

This package does not add request or response bodies, full headers, baggage values, payload sizes, or message payloads as default custom telemetry fields. It also does not create separate span attributes or metrics for raw query strings.

Do not add raw query strings, request or response bodies, full headers, baggage values, or message payloads to spans or metrics unless the application has reviewed privacy, cardinality, retention, and redaction requirements. Prefer explicit allowlists, redaction, and stable low-cardinality attributes when extending telemetry with hooks.

## SSE Connection-Level Tracing and Custom Metrics

SSE is a long-lived HTTP response. Normal HTTP request duration ends at stream establishment, which does not reflect whether the stream is still running, interrupted, or errored. Therefore, this package treats SSE as **connection-level** telemetry.

### Span Lifecycle

After startup succeeds, the SSE interceptor attaches to `stream.closed` and keeps the span open until the stream reaches its normal, fatal, or aborted terminal state. It records:

- `sse.connected` — Stream successfully established
- `sse.closed` — Stream normal end (server EOF)
- `sse.aborted` — Active close via `stream.close()`
- `sse.error` — Connection error or reconnect exhaustion

### Custom Metrics

When `meter` is provided, the following defjs custom metrics are collected (non-official OpenTelemetry stable semantic conventions):

| Metric                                 | Unit       | Meaning                                                 |
| -------------------------------------- | ---------- | ------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Time to establish stream connection                     |
| `defjs.client.sse.connection.duration` | `s`        | Total duration from stream establishment to close/error |
| `defjs.client.sse.active_streams`      | `{stream}` | Current active SSE stream count                         |

By default, **per-event spans are not created**, and **event payloads, event IDs, `Last-Event-ID`, delivery latency, lost events, or reconnect queues are not collected**. These are application-level semantics that may produce high-cardinality or sensitive telemetry. Implement them at the application layer if needed.

## WebSocket Connection-Level Tracing and Custom Metrics

WebSocket starts with an HTTP Upgrade handshake, but production environments care more about the post-handshake connection lifecycle: active connections, connection duration, close/error behavior, and connection failure rate. Since OpenTelemetry WebSocket semantic conventions are not yet stable, this package uses connection-level custom metrics.

### Span Lifecycle

The WebSocket span stays open until `session.closed` resolves, recording the following lifecycle events:

- `websocket.connected` — Session successfully established
- `websocket.closed` — Connection normal close
- `websocket.error` — Connection error

### Custom Metrics

When `meter` is provided, the following defjs custom metrics are collected:

| Metric                                       | Unit           | Meaning                                                  |
| -------------------------------------------- | -------------- | -------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Time to establish WebSocket session                      |
| `defjs.client.websocket.connection.duration` | `s`            | Total duration from session establishment to close/error |
| `defjs.client.websocket.active_connections`  | `{connection}` | Current active WebSocket connection count                |

By default, **per-message spans are not created**, and **message payloads, message sizes, backpressure, buffered amount, subprotocols, or reconnect queues are not collected**. Keep any application-layer message telemetry opt-in, sampled, redacted, and limited to stable low-cardinality attributes whenever possible.

## What's Next

- [OpenTelemetry guide](https://defjs.org/plugins/opentelemetry-server) — complete plugin boundaries and examples
- [Client](https://defjs.org/core/client) — `createClient` and full transport configuration
- [SSE](https://defjs.org/core/sse) — `defineEventStream` and streaming event consumption
- [WebSocket](https://defjs.org/core/web-socket) — `defineWebSocket` and real-time communication
