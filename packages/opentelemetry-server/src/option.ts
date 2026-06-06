import type { ClientOption, Interceptor } from '@defjs/core'
import { withInterceptors } from '@defjs/core'
import type { Meter, Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core'
import { createOpenTelemetryHttpInterceptor } from './interceptor/http'
import { createOpenTelemetrySseInterceptor } from './interceptor/sse'
import { createOpenTelemetryWebSocketInterceptor } from './interceptor/web_socket'

export interface RequestMetrics {
  requestCounter: ReturnType<Meter['createCounter']>
  errorCounter: ReturnType<Meter['createCounter']>
  durationHistogram: ReturnType<Meter['createHistogram']>
}

export interface OpenTelemetryServerOptions {
  /** External OTel tracer (required) */
  tracer: Tracer
  /** Optional external OTel meter for metrics collection */
  meter?: Meter
  /** Propagator, default W3C TraceContext + Baggage Composite */
  propagator?: TextMapPropagator
  /** Only create outgoing span when an active parent span exists */
  requireParentSpan?: boolean
  /** Hook to customize span before request */
  requestHook?: (span: Span, req: any) => void
  /** Hook to customize span after response */
  responseHook?: (span: Span, res: any) => void
  /** Enable HTTP tracing, default true */
  http?: boolean
  /** Enable SSE tracing, default true */
  sse?: boolean
  /** Enable WebSocket tracing, default true */
  webSocket?: boolean
  /** WebSocket query string propagation, default true */
  webSocketQueryPropagation?: boolean
}

export function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption {
  const {
    tracer,
    meter,
    http = true,
    sse = true,
    webSocket = true,
    webSocketQueryPropagation = true,
    propagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
    requireParentSpan = false,
    requestHook,
    responseHook,
  } = options

  const metrics = meter
    ? {
        requestCounter: meter.createCounter('http.client.request', {
          description: 'Number of HTTP client requests',
        }),
        errorCounter: meter.createCounter('http.client.request.error', {
          description: 'Number of HTTP client request errors',
        }),
        durationHistogram: meter.createHistogram('http.client.request.duration', {
          description: 'HTTP client request duration',
          unit: 's',
          advice: {
            explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
          },
        }),
      }
    : undefined

  const interceptors: Interceptor[] = []

  if (http) {
    interceptors.push(
      createOpenTelemetryHttpInterceptor({
        tracer,
        propagator,
        metrics,
        requireParentSpan,
        requestHook,
        responseHook,
      }),
    )
  }

  if (sse) {
    interceptors.push(
      createOpenTelemetrySseInterceptor({
        tracer,
        propagator,
        metrics,
        requireParentSpan,
      }),
    )
  }

  if (webSocket) {
    interceptors.push(
      createOpenTelemetryWebSocketInterceptor({
        tracer,
        propagator,
        metrics,
        requireParentSpan,
        queryPropagation: webSocketQueryPropagation,
      }),
    )
  }

  return withInterceptors(...interceptors)
}
