# @defjs/opentelemetry-server

Server-side outbound OpenTelemetry integration for `@defjs/core` HTTP, SSE, and WebSocket clients.

**Core Positioning**:

- **Outbound-only client instrumentation** — This package wraps defjs clients that make outbound requests. It is not inbound server instrumentation.
- **Server environment** — Designed for server-side Node.js usage, not browser-only telemetry setup.
- **Does not initialize the SDK** — This package does not initialize an OpenTelemetry SDK. Initialize the SDK in your application, then pass the tracer and optional meter into `withOpenTelemetryServer(...)`.
- **Per-transport separation** — HTTP, SSE, and WebSocket each have independent interceptors, span lifecycles, and metric dimensions.

## Installation

Install `@defjs/opentelemetry-server` with the matching `@defjs/core` release line and its OpenTelemetry peers:

```sh
npm install @defjs/core @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

Initialize your application's OpenTelemetry SDK separately. The package provides interceptors and consumes the tracer and optional meter you pass to `withOpenTelemetryServer(...)`.

## Basic Usage

Initialize the OpenTelemetry SDK in your application, get a `Tracer`, then pass it into `withOpenTelemetryServer(...)`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. Initialize the OpenTelemetry SDK in your application, then get a tracer
const tracer = trace.getTracer('my-service')

// 2. Inject the tracer into defjs client configuration
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
  }),
)
```

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

| Option         | Type                                   | Default     | Description                                                          |
| -------------- | -------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `enabled`      | `boolean`                              | `true`      | Enable HTTP tracing                                                  |
| `requestHook`  | `(span, req) => void \| Promise<void>` | `undefined` | Customize HTTP span before request, `req` is `HttpRequest`           |
| `responseHook` | `(span, res) => void \| Promise<void>` | `undefined` | Customize HTTP span after response, `res` is `HttpResponse<unknown>` |

### SSE Options

| Option         | Type                                      | Default     | Description                                                                               |
| -------------- | ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                                 | `true`      | Enable SSE tracing                                                                        |
| `requestHook`  | `(span, req) => void \| Promise<void>`    | `undefined` | Customize SSE span before stream request                                                  |
| `responseHook` | `(span, stream) => void \| Promise<void>` | `undefined` | Customize SSE span after stream handle returned, `stream` is `EventStreamHandle<unknown>` |

### WebSocket Options

| Option             | Type                                       | Default     | Description                                                                                                                         |
| ------------------ | ------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                                  | `true`      | Enable WebSocket tracing                                                                                                            |
| `queryPropagation` | `boolean`                                  | `false`     | Inject trace context and baggage into the WebSocket URL query string. Enable only after reviewing URL logging and disclosure risks. |
| `requestHook`      | `(span, req) => void \| Promise<void>`     | `undefined` | Customize WebSocket span before connection request                                                                                  |
| `responseHook`     | `(span, session) => void \| Promise<void>` | `undefined` | Customize WebSocket span after session returned, `session` is `WebSocketSessionLike`                                                |

> **Hook Exception Handling**: Hooks may return `void` or `Promise<void>`. If `requestHook` or `responseHook` throws or rejects, the error is recorded on the span's `defjs.otel.hook.error` event without blocking the hook caller, and the client request/stream/session **continues normally**.
>
> **Attribute hygiene**: Prefer explicit allowlists, redaction, and stable low-cardinality attributes in `requestHook` / `responseHook`. Do not attach raw query strings, request or response bodies, full headers, baggage values, or message payloads unless your application has already reviewed privacy, cardinality, retention, and redaction requirements.

## HTTP Semantic Conventions and Metrics

HTTP tracing uses stable OpenTelemetry HTTP client attribute and metric names. This is not a claim of complete semantic-convention compliance. The interceptor creates a `SpanKind.CLIENT` span named after the request method because Defjs does not provide a low-cardinality URL template. It records these core attributes:

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

In the current implementation, `url.full` is resolved from `req.endpoint` and the optional `req.baseEndpoint`; it does not append `req.queryString`. This is an implementation boundary, not a guarantee that URLs are safe: endpoint fields and WebSocket propagation can still contain sensitive or high-cardinality values.

When `meter` is provided, the following stable metrics are collected:

| Metric                         | Unit | Attributes                                                                                                          |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, `server.address`, `server.port`, optional `http.response.status_code`, optional `error.type` |

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

- [OpenTelemetry guide](docs/plugins/opentelemetry-server.md) — complete plugin boundaries and examples
- [Client](docs/core/client.md) — `createClient` and full transport configuration
- [SSE](docs/core/sse.md) — `defineEventStream` and streaming event consumption
- [WebSocket](docs/core/web-socket.md) — `defineWebSocket` and real-time communication
