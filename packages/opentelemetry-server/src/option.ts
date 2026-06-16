import type { ClientOption, EventStreamHandle, HttpRequest, HttpResponse, WebSocketSessionLike } from '@defjs/core'
import type { Meter, Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core'
import { createOpenTelemetryHttpInterceptor } from './interceptor/http'
import { createOpenTelemetrySSEInterceptor } from './interceptor/sse'
import { createOpenTelemetryWebSocketInterceptor } from './interceptor/web_socket'
import { createHttpClientMetrics, createSSEClientMetrics, createWebSocketClientMetrics } from './telemetry/metrics'

export interface OpenTelemetryServerHttpOptions {
  /** Enable HTTP tracing, default true */
  enabled?: boolean
  /** Hook to customize HTTP span before request */
  requestHook?: (span: Span, req: HttpRequest) => void
  /** Hook to customize HTTP span after response */
  responseHook?: (span: Span, res: HttpResponse<unknown>) => void
}

export interface OpenTelemetryServerSSEOptions {
  /** Enable SSE tracing, default true */
  enabled?: boolean
  /** Hook to customize SSE span before request */
  requestHook?: (span: Span, req: HttpRequest) => void
  /** Hook to customize SSE span after stream is returned */
  responseHook?: (span: Span, stream: EventStreamHandle<unknown>) => void
}

export interface OpenTelemetryServerWebSocketOptions {
  /** Enable WebSocket tracing, default true */
  enabled?: boolean
  /** WebSocket query string propagation, default true */
  queryPropagation?: boolean
  /** Hook to customize WebSocket span before connect */
  requestHook?: (span: Span, req: HttpRequest) => void
  /** Hook to customize WebSocket span after session is returned */
  responseHook?: (span: Span, session: WebSocketSessionLike) => void
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
  /** HTTP tracing options */
  http?: OpenTelemetryServerHttpOptions
  /** SSE tracing options */
  sse?: OpenTelemetryServerSSEOptions
  /** WebSocket tracing options */
  webSocket?: OpenTelemetryServerWebSocketOptions
}

interface TransportSwitch {
  enabled?: boolean
}

export function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption {
  assertNoRemovedOptions(options)

  const {
    tracer,
    meter,
    propagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
    requireParentSpan = false,
  } = options

  return (config) => {
    if (isTransportEnabled(options.http)) {
      config.interceptors.push(
        createOpenTelemetryHttpInterceptor({
          tracer,
          propagator,
          metrics: meter ? createHttpClientMetrics(meter) : undefined,
          requireParentSpan,
          requestHook: options.http?.requestHook,
          responseHook: options.http?.responseHook,
        }),
      )
    }

    if (isTransportEnabled(options.sse)) {
      config.interceptors.push(
        createOpenTelemetrySSEInterceptor({
          tracer,
          propagator,
          metrics: meter ? createSSEClientMetrics(meter) : undefined,
          requireParentSpan,
          requestHook: options.sse?.requestHook,
          responseHook: options.sse?.responseHook,
        }),
      )
    }

    if (isTransportEnabled(options.webSocket)) {
      config.interceptors.push(
        createOpenTelemetryWebSocketInterceptor({
          tracer,
          propagator,
          metrics: meter ? createWebSocketClientMetrics(meter) : undefined,
          requireParentSpan,
          queryPropagation: options.webSocket?.queryPropagation,
          requestHook: options.webSocket?.requestHook,
          responseHook: options.webSocket?.responseHook,
        }),
      )
    }
  }
}

function isTransportEnabled(option: TransportSwitch | undefined): boolean {
  return option?.enabled !== false
}

function assertNoRemovedOptions(options: OpenTelemetryServerOptions): void {
  const unsafeOptions = options as OpenTelemetryServerOptions & {
    requestHook?: unknown
    responseHook?: unknown
    webSocketQueryPropagation?: unknown
  }

  assertTransportOptionObject('http', options.http)
  assertTransportOptionObject('sse', options.sse)
  assertTransportOptionObject('webSocket', options.webSocket)

  if ('requestHook' in unsafeOptions) {
    throw new TypeError('requestHook has been moved to http.requestHook, sse.requestHook, or webSocket.requestHook.')
  }
  if ('responseHook' in unsafeOptions) {
    throw new TypeError('responseHook has been moved to http.responseHook, sse.responseHook, or webSocket.responseHook.')
  }
  if ('webSocketQueryPropagation' in unsafeOptions) {
    throw new TypeError('webSocketQueryPropagation has been moved to webSocket.queryPropagation.')
  }
}

function assertTransportOptionObject(name: 'http' | 'sse' | 'webSocket', option: unknown): void {
  if (typeof option === 'boolean') {
    throw new TypeError(`${name}: ${option} has been removed; use ${name}: { enabled: ${option} }.`)
  }
}
