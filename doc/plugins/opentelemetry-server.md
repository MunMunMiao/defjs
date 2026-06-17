---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Server-side OpenTelemetry integration package, providing outbound trace and metrics collection for `@defjs/core` HTTP, SSE, and WebSocket clients.

**Core Positioning**:

- **Server environment** (Node.js, Bun, Deno), not dependent on browser environment.
- **Does not initialize SDK** — You must initialize the OpenTelemetry SDK externally, then pass the created `Tracer` (and optionally `Meter`).
- **Per-transport separation** — HTTP, SSE, and WebSocket each have independent interceptors, span lifecycles, and metric dimensions.

## Installation

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

## Basic Usage

Pass an externally created `Tracer` and configure the client via `withOpenTelemetryServer`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. Initialize OpenTelemetry SDK externally, then get tracer
const tracer = trace.getTracer('my-service')

// 2. Inject tracer into client configuration
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
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
      queryPropagation: false,
    },
  }),
)
```

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

| Option         | Type                  | Default     | Description                                                          |
| -------------- | --------------------- | ----------- | -------------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | Enable HTTP tracing                                                  |
| `requestHook`  | `(span, req) => void` | `undefined` | Customize HTTP span before request, `req` is `HttpRequest`           |
| `responseHook` | `(span, res) => void` | `undefined` | Customize HTTP span after response, `res` is `HttpResponse<unknown>` |

### SSE Options

| Option         | Type                     | Default     | Description                                                                               |
| -------------- | ------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | Enable SSE tracing                                                                        |
| `requestHook`  | `(span, req) => void`    | `undefined` | Customize SSE span before stream request                                                  |
| `responseHook` | `(span, stream) => void` | `undefined` | Customize SSE span after stream handle returned, `stream` is `EventStreamHandle<unknown>` |

### WebSocket Options

| Option             | Type                      | Default     | Description                                                                          |
| ------------------ | ------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `enabled`          | `boolean`                 | `true`      | Enable WebSocket tracing                                                             |
| `queryPropagation` | `boolean`                 | `true`      | Inject trace context into WebSocket URL query string                                 |
| `requestHook`      | `(span, req) => void`     | `undefined` | Customize WebSocket span before connection request                                   |
| `responseHook`     | `(span, session) => void` | `undefined` | Customize WebSocket span after session returned, `session` is `WebSocketSessionLike` |

> **Hook Exception Handling**: If `requestHook` or `responseHook` throws, the error is recorded on the span's `defjs.otel.hook.error` event, but the client request/stream/session **continues normally**.

## HTTP Semantic Conventions and Metrics

HTTP tracing follows stable OpenTelemetry HTTP client semantic conventions. By default, it records `SpanKind.CLIENT` spans with the following low-cardinality attributes:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

When `meter` is provided, the following stable metrics are collected:

| Metric                         | Unit | Attributes                                                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, optional `http.response.status_code`, optional `server.address`, optional `server.port`, optional `error.type` |

By default, **request/response bodies, all headers, raw query strings, payload sizes, and network event details are not collected**. These are typically high-cardinality or sensitive. Add them explicitly via `requestHook` / `responseHook` if needed.

## SSE Connection-Level Tracing and Custom Metrics

SSE is a long-lived HTTP response. Normal HTTP request duration ends at stream establishment, which does not reflect whether the stream is still running, interrupted, or errored. Therefore, this package treats SSE as **connection-level** telemetry.

### Span Lifecycle

The SSE span stays open until `stream.closed` resolves, recording the following lifecycle events:

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

By default, **per-message spans are not created**, and **message payloads, message sizes, backpressure, buffered amount, subprotocols, or reconnect queues are not collected**. Message-level telemetry should be implemented at the application layer with sampling strategies.

## WebSocket Query Propagation Security Risk

Browser WebSocket clients typically cannot set arbitrary HTTP headers, so this package defaults to injecting trace context into the WebSocket URL query string for browser compatibility.

This choice has a security trade-off: query strings may appear in access logs, proxy logs, browser/network debugging tools, and APM URL fields. If the propagator includes `baggage`, baggage values are also written to the URL, potentially carrying sensitive data.

For security-sensitive WebSocket traffic, explicitly disable query propagation:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

After disabling, trace context no longer propagates via URL. The server must rely on other mechanisms for trace correlation (e.g., trace ID fields in the application-layer message protocol).

## What's Next

- [Client](/core/client) — `createClient` and full transport configuration
- [SSE](/core/sse) — `defineEventStream` and streaming event consumption
- [WebSocket](/core/web-socket) — `defineWebSocket` and real-time communication
