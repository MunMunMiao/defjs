# @defjs/opentelemetry

OpenTelemetry integration for @defjs/core.

## Installation

```bash
npm install @defjs/opentelemetry @opentelemetry/api
```

## Usage

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetry } from '@defjs/opentelemetry'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetry({ serviceName: 'my-app' }),
)
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | `'unknown-service'` | Service name for telemetry |
| `http` | `boolean` | `true` | Enable HTTP tracing |
| `sse` | `boolean` | `true` | Enable SSE tracing |
| `webSocket` | `boolean` | `true` | Enable WebSocket tracing |
| `recordBodies` | `boolean` | `false` | Record request/response bodies |
| `recordHeaders` | `boolean` | `false` | Record full headers |
| `webSocketQueryPropagation` | `boolean` | `true` | Use query string for WebSocket propagation |
| `propagator` | `TextMapPropagator` | W3C TraceContext + Baggage | Custom propagator |
