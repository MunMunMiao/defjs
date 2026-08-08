---
title: OpenTelemetry Server
description: Instrument outbound Defjs HTTP, SSE, and WebSocket clients with an application-supplied OpenTelemetry Tracer and optional Meter.
---

# `@defjs/opentelemetry-server`

Despite its package name, this adapter instruments outbound Defjs client work. It is not inbound server instrumentation and does not initialize an OpenTelemetry SDK.

The application owns:

- SDK and provider setup;
- exporter and processor configuration;
- context manager and active-context setup;
- sampling, attribute policy, and redaction;
- force-flush and shutdown.

Pass an application-supplied `Tracer` and optional `Meter` to `withOpenTelemetryServer(...)`.

## Configure the Client

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

The adapter adds one interceptor for each enabled transport. Options run in normal client order, so placement relative to other interceptors controls which work the spans wrap.

## Options

```typescript
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

Each transport option accepts `enabled?: boolean`, `requestHook`, and `responseHook`. WebSocket also accepts `queryPropagation?: boolean`.

All three transports are enabled by default. Use an option object to disable one:

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

Old boolean transport fields, top-level hooks, and `webSocketQueryPropagation` are rejected at runtime with migration errors. Current forms are transport option objects, transport-scoped hooks, and `webSocket.queryPropagation`.

## Propagation

When `propagator` is omitted, the package creates its own `CompositePropagator` containing W3C Trace Context and W3C Baggage propagators. It does not read the global propagator configuration.

HTTP and SSE inject every field produced by that propagator into request headers. When `req.headers` is already a `Headers` instance, the current implementation reuses and mutates that instance. Otherwise it creates a new `Headers` object. WebSocket query propagation defaults to `true` because browser sockets cannot add arbitrary handshake headers. It appends every field produced by the propagator to the connection query string.

Before it creates a span, each interceptor also calls `propagator.extract(...)` on the request headers. Treat that carrier as trusted, application-owned input. Do not let an untrusted caller supply `traceparent`, `tracestate`, or `baggage`: those fields can replace the active parent context. Remove or normalize untrusted propagation fields before the request reaches this interceptor.

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: false,
  },
})
```

Disable query propagation unless URL propagation has been reviewed for the deployment. Trace context and baggage can be recorded by browsers, proxies, access logs, and telemetry systems. A custom propagator can add more fields than `traceparent`.

`requireParentSpan: true` checks for an active parent span before the interceptor does any instrumentation. When no active span exists, it skips span creation, propagation, hooks, and metrics, then calls the next handler unchanged.

## Hook Behavior

Hooks receive the transport-specific span and request/result:

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response) {
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

Hooks are synchronous. A synchronous throw is caught, recorded as `defjs.otel.hook.error`, and does not stop the client operation. If JavaScript bypasses the type and returns a rejected promise, that asynchronous rejection is not awaited or caught by the hook wrapper.

Use allowlisted, low-cardinality attributes. Do not attach raw headers, query strings, bodies, baggage, event IDs, message payloads, or credentials.

## HTTP Semantics

The HTTP interceptor creates a `SpanKind.CLIENT` span and records:

- `http.request.method`;
- `url.full`;
- `server.address` and optional `server.port`;
- `http.response.status_code` after a response.

This is not a claim of complete HTTP semantic-convention compliance.

Current status behavior is narrower than many applications expect:

- status `500` and above marks the span `ERROR`;
- status `400` through `499` marks it `OK`;
- a Defjs status-0 transport response marks it `OK`;
- an error thrown through the interceptor marks it `ERROR` and records an exception.

The HTTP span ends when the HTTP interceptor receives the Defjs `HttpResponse`. High-level output status dispatch and Struct decoding happen after that interceptor returns. A later `RESPONSE_VALIDATION_FAILED` or `UNDECLARED_STATUS` therefore cannot update the ended span.

When a Meter is supplied, HTTP records `http.client.request.duration` in seconds. Attributes include the method, server address/port, optional response status, and optional `error.type` for thrown errors.

## SSE Semantics

After SSE startup succeeds, the span stays open until `stream.closed` settles. It records `sse.connected`, then one of `sse.closed`, `sse.aborted`, or `sse.error` on covered close paths.

Meter-backed SSE instruments:

| Metric                                 | Meaning                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | Time until the logical stream handle is returned.                 |
| `defjs.client.sse.connection.duration` | Time from handle return until terminal close.                     |
| `defjs.client.sse.active_streams`      | Number of logical handles whose `closed` promise has not settled. |

These are Defjs custom metrics. The active counter includes time spent between physical reconnect attempts. It does not count currently open HTTP connections.

If a core callback path leaves `stream.closed` unsettled, the span and counter cannot finish through that promise. Keep reconnect callbacks non-throwing.

## WebSocket Semantics

After startup succeeds, the WebSocket span stays open until `session.closed` settles. It records `websocket.connected`, then `websocket.closed` or `websocket.error` on covered paths.

Meter-backed WebSocket instrumentation uses:

| Metric                                       | Meaning                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `defjs.client.websocket.connect.duration`    | Time until the logical session is returned.                        |
| `defjs.client.websocket.connection.duration` | Time from session return until terminal close.                     |
| `defjs.client.websocket.active_connections`  | Number of logical sessions whose `closed` promise has not settled. |

The metric name says connections, but the implementation counts logical sessions, including reconnect delay gaps. It does not count physical sockets.

Generic WebSocket semantic conventions are not stable here. The package does not create a span per message or record payloads and queue lengths by default.

## Sensitive Data and Coverage Limits

Default `url.full` is resolved from the request endpoint and base endpoint rather than the serialized query string, but resolved paths can still contain sensitive identifiers. WebSocket propagation separately appends fields to the actual query string.

`recordException(...)` receives thrown errors and selected close causes. Error messages and stacks can expose sensitive data. Configure SDK-level processors and exporter redaction accordingly; this adapter does not sanitize exceptions for the application.

Before deploying, validate this adapter with the SDK, exporters, processors, context manager, and automatic instrumentation used by your service. Check end-to-end baggage, redaction, shutdown/flush, and duplicate spans under real traffic.

## Next

- [Interceptors](/core/interceptors) explains ordering around other client interceptors.
- [SSE](/core/sse) and [WebSocket](/core/web-socket) explain the logical handle/session lifetimes counted here.
