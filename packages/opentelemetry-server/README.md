# @defjs/opentelemetry-server

Server-side OpenTelemetry integration for @defjs/core HTTP/SSE/WebSocket clients.

This package provides outbound tracing and metrics for defjs client requests in server-side environments (Node.js, Bun, Deno). It does **not** initialize an OpenTelemetry SDK — you must create and pass your own `Tracer` (and optionally `Meter`).

## Installation

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

## Usage

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// Create your tracer externally after initializing the OpenTelemetry SDK.
const tracer = trace.getTracer('my-service')

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

Transport-specific hooks are configured under the transport they observe:

```ts
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    http: {
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
      queryPropagation: false,
    },
  }),
)
```

## Configuration

| Option              | Type                                  | Default                    | Description                                                      |
| ------------------- | ------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| `tracer`            | `Tracer`                              | **required**               | External OpenTelemetry tracer.                                   |
| `meter`             | `Meter`                               | `undefined`                | External OpenTelemetry meter. Metrics are disabled when omitted. |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Custom propagator used for context extraction/injection.         |
| `requireParentSpan` | `boolean`                             | `false`                    | Only trace when an active parent span exists.                    |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP transport tracing/metrics options.                          |
| `sse`               | `OpenTelemetryServerSseOptions`       | `{}`                       | SSE transport tracing/metrics options.                           |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket transport tracing/metrics options.                     |

### HTTP options

| Option         | Type                  | Default     | Description                                                                               |
| -------------- | --------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | Enable HTTP instrumentation.                                                              |
| `requestHook`  | `(span, req) => void` | `undefined` | Customize the HTTP span before the request is sent.                                       |
| `responseHook` | `(span, res) => void` | `undefined` | Customize the HTTP span after the response is returned. `res` is `HttpResponse<unknown>`. |

### SSE options

| Option         | Type                     | Default     | Description                                                                                           |
| -------------- | ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | Enable SSE instrumentation.                                                                           |
| `requestHook`  | `(span, req) => void`    | `undefined` | Customize the SSE span before the stream request is sent.                                             |
| `responseHook` | `(span, stream) => void` | `undefined` | Customize the SSE span after the stream handle is returned. `stream` is `EventStreamHandle<unknown>`. |

### WebSocket options

| Option             | Type                      | Default     | Description                                                                                      |
| ------------------ | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `enabled`          | `boolean`                 | `true`      | Enable WebSocket instrumentation.                                                                |
| `queryPropagation` | `boolean`                 | `true`      | Inject trace context into the WebSocket URL query string.                                        |
| `requestHook`      | `(span, req) => void`     | `undefined` | Customize the WebSocket span before the connection request is sent.                              |
| `responseHook`     | `(span, session) => void` | `undefined` | Customize the WebSocket span after the session is returned. `session` is `WebSocketSessionLike`. |

Instrumentation hooks are telemetry customization hooks. If a hook throws, the error is recorded on the span as `defjs.otel.hook.error`, but the client request/stream/session continues.

## Migration from the old API

| Old configuration           | New configuration                                                   |
| --------------------------- | ------------------------------------------------------------------- |
| `http: false`               | `http: { enabled: false }`                                          |
| `sse: false`                | `sse: { enabled: false }`                                           |
| `webSocket: false`          | `webSocket: { enabled: false }`                                     |
| `requestHook`               | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook`    |
| `responseHook`              | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                        |

The old top-level hooks and boolean transport toggles are intentionally removed so each transport exposes the correct request/response types. Passing those removed options from JavaScript now throws a migration error instead of being silently interpreted as enabled instrumentation.

## Monitoring model

### HTTP

HTTP instrumentation follows stable OpenTelemetry HTTP client semantics where possible.

Default HTTP tracing records a `SpanKind.CLIENT` span with low-cardinality attributes such as:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

When `meter` is provided, HTTP records the stable metric:

| Metric                         | Unit | Attributes                                                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, optional `http.response.status_code`, optional `server.address`, optional `server.port`, optional `error.type` |

This package does not capture request/response bodies, all headers, raw query strings, payload sizes, or network event details by default. Those fields are often high-cardinality or sensitive and should be added explicitly through hooks when needed.

### SSE

SSE is a long-lived HTTP response. A plain HTTP duration can end too early and fail to show whether streams are still open, aborted, or failing. This package therefore treats SSE as connection-level telemetry.

Default SSE tracing keeps the span open until `stream.closed` settles and records lifecycle events:

- `sse.connected`
- `sse.closed`
- `sse.aborted`
- `sse.error`

When `meter` is provided, SSE records custom defjs metrics:

| Metric                                 | Unit       | Meaning                                           |
| -------------------------------------- | ---------- | ------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Time to establish the stream.                     |
| `defjs.client.sse.connection.duration` | `s`        | Time from stream establishment until close/error. |
| `defjs.client.sse.active_streams`      | `{stream}` | Number of currently active SSE streams.           |

These are library-level custom metrics, not official stable OpenTelemetry semantic conventions.

This package does not create spans for every SSE event and does not capture event payloads, event IDs, `Last-Event-ID`, delivery latency, missed events, or reconnect queues by default. Those are real production concerns, but they require application semantics and can create high-cardinality or sensitive telemetry.

### WebSocket

WebSocket starts as an HTTP Upgrade, but the useful production signal is usually the connection lifecycle after the handshake: active connections, connection duration, close/error behavior, and connection failures. Generic WebSocket semantic conventions are not stable in OpenTelemetry yet, so this package uses connection-level custom metrics.

Default WebSocket tracing keeps the span open until `session.closed` settles and records lifecycle events:

- `websocket.connected`
- `websocket.closed`
- `websocket.error`

When `meter` is provided, WebSocket records custom defjs metrics:

| Metric                                       | Unit           | Meaning                                            |
| -------------------------------------------- | -------------- | -------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Time to establish the WebSocket session.           |
| `defjs.client.websocket.connection.duration` | `s`            | Time from session establishment until close/error. |
| `defjs.client.websocket.active_connections`  | `{connection}` | Number of currently active WebSocket connections.  |

These are library-level custom metrics, not official stable OpenTelemetry semantic conventions.

This package does not create spans for every sent/received message and does not capture message payloads, message sizes, backpressure, buffered amount, subprotocol, or reconnect queues by default. Message-level telemetry should be opt-in and filtered/sampled at the application layer.

## WebSocket query propagation risk

Browser WebSocket clients usually cannot set arbitrary headers, so this package keeps the existing behavior of injecting trace context into the WebSocket query string by default.

That compatibility choice has security trade-offs: query strings can appear in access logs, proxy logs, browser/network tooling, and APM URL fields. If your propagator includes `baggage`, baggage values may also be written into the URL and can contain sensitive data.

For security-sensitive WebSocket traffic, disable query propagation:

```ts
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```
