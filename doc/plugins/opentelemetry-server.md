---
title: OpenTelemetry Server
description: Outbound-only client tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Server-side outbound OpenTelemetry integration for `@defjs/core` HTTP, SSE, and WebSocket clients.

This package is outbound-only client instrumentation. It wraps defjs clients that make outbound requests; it is not inbound server instrumentation.

This package does **not** initialize an OpenTelemetry SDK. Initialize the SDK in your application, then pass the tracer and optional meter into `withOpenTelemetryServer(...)`.

## Repository workspace setup

This page currently documents source/workspace usage from this repository. `@defjs/opentelemetry-server` lives at `packages/opentelemetry-server`, and its peer dependency expects the matching `@defjs/core` workspace version from `packages/core`.

The import specifiers shown below use package names, but in this repository they resolve to workspace source packages rather than a registry-published package pair. Keep installing and initializing your application's OpenTelemetry SDK packages separately.

Public npm does not currently provide `@defjs/opentelemetry-server`, and the latest standalone `@defjs/core` release available there is not a compatible peer for this workspace package. If you later publish both `@defjs/opentelemetry-server` and a compatible `@defjs/core` release to a registry you control or another registry that carries both versions, install those published versions together in that environment instead of mixing this package with an incompatible standalone `@defjs/core` release.

## Usage

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// Create your tracer after initializing the OpenTelemetry SDK in your application.
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

## Configuration

| Option              | Type                                  | Default                    | Description                                                      |
| ------------------- | ------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| `tracer`            | `Tracer`                              | **required**               | External OpenTelemetry tracer.                                   |
| `meter`             | `Meter`                               | `undefined`                | External OpenTelemetry meter. Metrics are disabled when omitted. |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Custom propagator used for context extraction/injection.         |
| `requireParentSpan` | `boolean`                             | `false`                    | Only trace when an active parent span exists.                    |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP transport tracing/metrics options.                          |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE transport tracing/metrics options.                           |
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

| Option             | Type                      | Default     | Description                                                                                                                                  |
| ------------------ | ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | Enable WebSocket instrumentation.                                                                                                            |
| `queryPropagation` | `boolean`                 | `true`      | Inject trace context into the WebSocket URL query string for browser compatibility. Use `false` as the recommended production baseline for security-sensitive traffic. |
| `requestHook`      | `(span, req) => void`     | `undefined` | Customize the WebSocket span before the connection request is sent.                                                                          |
| `responseHook`     | `(span, session) => void` | `undefined` | Customize the WebSocket span after the session is returned. `session` is `WebSocketSessionLike`.                                            |

Instrumentation hooks are telemetry customization hooks. If a hook throws, the error is recorded on the span as `defjs.otel.hook.error`, but the client request/stream/session continues.

Prefer explicit allowlists, redaction, and stable low-cardinality attributes in hooks. Do not attach raw query strings, request or response bodies, full headers, baggage values, or message payloads unless your application has already reviewed privacy, cardinality, retention, and redaction requirements.

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

Default HTTP tracing records a `SpanKind.CLIENT` span with these core attributes:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

`url.full` reflects the request URL your application constructs. Avoid placing tokens or other sensitive or high-cardinality user input in URLs when possible.

When `meter` is provided, HTTP records the stable metric:

| Metric                         | Unit | Attributes                                                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, optional `http.response.status_code`, optional `server.address`, optional `server.port`, optional `error.type` |

This package does not add request or response bodies, full headers, baggage values, payload sizes, or message payloads as default custom telemetry fields. It also does not create separate span attributes or metrics for raw query strings.

Do not add raw query strings, request or response bodies, full headers, baggage values, or message payloads to spans or metrics unless the application has reviewed privacy, cardinality, retention, and redaction requirements. Prefer explicit allowlists, redaction, and stable low-cardinality attributes when extending telemetry with hooks.

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

This package does not create spans for every sent/received message and does not capture message payloads, message sizes, backpressure, buffered amount, subprotocol, or reconnect queues by default. Keep any application-layer message telemetry opt-in, sampled, redacted, and limited to stable low-cardinality attributes whenever possible.
