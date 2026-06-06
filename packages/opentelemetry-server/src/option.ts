import type { Interceptor } from '@defjs/core'
import { type ClientOption, withInterceptors } from '@defjs/core'
import { type TextMapPropagator, trace } from '@opentelemetry/api'
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core'
import { createOpenTelemetryHttpInterceptor } from './interceptor/http'
import { createOpenTelemetrySseInterceptor } from './interceptor/sse'
import { createOpenTelemetryWebSocketInterceptor } from './interceptor/web_socket'
import { createRequestLogger } from './telemetry/logs'
import { createRequestMetrics } from './telemetry/metrics'

export interface OpenTelemetryOptions {
  /** Service name for telemetry resources */
  serviceName?: string
  /** Additional attributes for all telemetry */
  attributes?: Record<string, unknown>
  /** Enable HTTP tracing, default true */
  http?: boolean
  /** Enable SSE tracing, default true */
  sse?: boolean
  /** Enable WebSocket tracing, default true */
  webSocket?: boolean
  /** Record request/response bodies, default false */
  recordBodies?: boolean
  /** Record full headers, default false */
  recordHeaders?: boolean
  /** WebSocket query string propagation, default true */
  webSocketQueryPropagation?: boolean
  /** Custom propagator, default W3C TraceContext + Baggage */
  propagator?: TextMapPropagator
}

export function withOpenTelemetry(options: OpenTelemetryOptions = {}): ClientOption {
  const {
    serviceName = 'unknown-service',
    http = true,
    sse = true,
    webSocket = true,
    recordBodies = false,
    recordHeaders = false,
    webSocketQueryPropagation = true,
    propagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  } = options

  const tracer = trace.getTracer(serviceName)
  const requestMetrics = createRequestMetrics({ serviceName })
  const requestLogger = createRequestLogger({ serviceName })

  const interceptors: Interceptor[] = []

  if (http) {
    interceptors.push(
      createOpenTelemetryHttpInterceptor({
        tracer,
        propagator,
        metrics: requestMetrics,
        logger: requestLogger,
        recordBodies,
        recordHeaders,
      }),
    )
  }

  if (sse) {
    interceptors.push(
      createOpenTelemetrySseInterceptor({
        tracer,
        propagator,
        metrics: requestMetrics,
        logger: requestLogger,
      }),
    )
  }

  if (webSocket) {
    interceptors.push(
      createOpenTelemetryWebSocketInterceptor({
        tracer,
        propagator,
        metrics: requestMetrics,
        logger: requestLogger,
        queryPropagation: webSocketQueryPropagation,
      }),
    )
  }

  return withInterceptors(...interceptors)
}
