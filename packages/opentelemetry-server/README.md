---
title: OpenTelemetry Server
description: Outbound-only client tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Server-side outbound OpenTelemetry integration for `@defjs/core` HTTP, SSE, and WebSocket clients.

**Core Positioning**:

- **Outbound-only client instrumentation** — This package wraps defjs clients that make outbound requests. It is not inbound server instrumentation.
- **Server environment** — Designed for Node.js, Bun, and Deno usage, not browser-only telemetry setup.
- **Does not initialize the SDK** — This package does not initialize an OpenTelemetry SDK. Initialize the SDK in your application, then pass the tracer and optional meter into `withOpenTelemetryServer(...)`.
- **Per-transport separation** — HTTP, SSE, and WebSocket each have independent interceptors, span lifecycles, and metric dimensions.

## Repository workspace setup

This guide currently documents source/workspace usage from this repository. `@defjs/opentelemetry-server` lives at `packages/opentelemetry-server`, and its peer dependency expects the matching `@defjs/core` workspace version from `packages/core`.

The import specifiers shown below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. Keep installing and initializing your application's OpenTelemetry SDK packages separately.

Public npm does not currently provide `@defjs/opentelemetry-server`, and the latest standalone `@defjs/core` release available there is not a compatible peer for this workspace package. If you later publish both `@defjs/opentelemetry-server` and a compatible `@defjs/core` release to a registry you control or another registry that carries both versions, install those published versions together in that environment instead of mixing this package with an incompatible standalone `@defjs/core` release.

## Basic Usage

Initialize the OpenTelemetry SDK in your application, get a `Tracer`, then pass it into `withOpenTelemetryServer(...)`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. Initialize the OpenTelemetry SDK in your application, then get a tracer
const tracer = trace.getTracer('my-service')

// 2. Inject the tracer into defjs client configuration
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

## Production baseline for WebSocket propagation

Browser WebSocket clients usually cannot set arbitrary headers, so `webSocket.queryPropagation` defaults to `true` for compatibility. That default injects trace context into the WebSocket URL query string.

For security-sensitive production traffic, use this recommended production baseline unless you have reviewed URL-based propagation for your environment:

```ts
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: false,
  },
})
```

Query strings can be recorded by proxies, browsers, APM tooling, access logs, and network debugging tools. They may also contain tokens or other high-cardinality user input. If your propagator includes `baggage`, baggage values can also be written into the URL and may contain sensitive data.

After disabling query propagation, trace context no longer rides on the WebSocket URL. Use another reviewed correlation mechanism at the application layer if your server still needs to link the connection to a trace.

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

| Option             | Type                      | Default     | Description                                                                                                                                 |
| ------------------ | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | Enable WebSocket tracing                                                                                                                    |
| `queryPropagation` | `boolean`                 | `true`      | Inject trace context into the WebSocket URL query string for browser compatibility. Use `false` as the recommended production baseline for security-sensitive traffic. |
| `requestHook`      | `(span, req) => void`     | `undefined` | Customize WebSocket span before connection request                                                                                          |
| `responseHook`     | `(span, session) => void` | `undefined` | Customize WebSocket span after session returned, `session` is `WebSocketSessionLike`                                                        |

> **Hook Exception Handling**: If `requestHook` or `responseHook` throws, the error is recorded on the span's `defjs.otel.hook.error` event, but the client request/stream/session **continues normally**.
>
> **Attribute hygiene**: Prefer explicit allowlists, redaction, and stable low-cardinality attributes in `requestHook` / `responseHook`. Do not attach raw query strings, request or response bodies, full headers, baggage values, or message payloads unless your application has already reviewed privacy, cardinality, retention, and redaction requirements.

## HTTP Semantic Conventions and Metrics

HTTP tracing follows stable OpenTelemetry HTTP client semantic conventions. By default, it records `SpanKind.CLIENT` spans with these core attributes:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

`url.full` reflects the request URL your application constructs. Avoid placing tokens or other sensitive or high-cardinality user input in URLs when possible.

When `meter` is provided, the following stable metrics are collected:

| Metric                         | Unit | Attributes                                                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, optional `http.response.status_code`, optional `server.address`, optional `server.port`, optional `error.type` |

This package does not add request or response bodies, full headers, baggage values, payload sizes, or message payloads as default custom telemetry fields. It also does not create separate span attributes or metrics for raw query strings.

Do not add raw query strings, request or response bodies, full headers, baggage values, or message payloads to spans or metrics unless the application has reviewed privacy, cardinality, retention, and redaction requirements. Prefer explicit allowlists, redaction, and stable low-cardinality attributes when extending telemetry with hooks.

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

By default, **per-message spans are not created**, and **message payloads, message sizes, backpressure, buffered amount, subprotocols, or reconnect queues are not collected**. Keep any application-layer message telemetry opt-in, sampled, redacted, and limited to stable low-cardinality attributes whenever possible.

## What's Next

- [Client](/core/client) — `createClient` and full transport configuration
- [SSE](/core/sse) — `defineEventStream` and streaming event consumption
- [WebSocket](/core/web-socket) — `defineWebSocket` and real-time communication
