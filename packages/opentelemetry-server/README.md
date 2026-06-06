# @defjs/opentelemetry-server

Server-side OpenTelemetry integration for @defjs/core HTTP/SSE/WebSocket clients.

This package provides outbound tracing and metrics for defjs client requests in server-side environments (Node.js, Bun, Deno). It does **not** initialize an OpenTelemetry SDK — you must create and pass your own `Tracer` (and optionally `Meter`).

## Installation

```bash
npm install @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

## Usage

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// Create your tracer externally (after initializing OTel SDK)
const tracer = trace.getTracer('my-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({ tracer }),
)
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tracer` | `Tracer` | **required** | External OTel tracer |
| `meter` | `Meter` | `undefined` | External OTel meter (enables metrics) |
| `propagator` | `TextMapPropagator` | W3C TraceContext + Baggage | Custom propagator |
| `requireParentSpan` | `boolean` | `false` | Only trace when an active parent span exists |
| `requestHook` | `(span, req) => void` | `undefined` | Customize span before request |
| `responseHook` | `(span, res) => void` | `undefined` | Customize span after response |
| `http` | `boolean` | `true` | Enable HTTP tracing |
| `sse` | `boolean` | `true` | Enable SSE tracing |
| `webSocket` | `boolean` | `true` | Enable WebSocket tracing |
| `webSocketQueryPropagation` | `boolean` | `true` | Use query string for WebSocket propagation |
