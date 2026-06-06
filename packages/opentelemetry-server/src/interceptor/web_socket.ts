import { createWebSocketInterceptor } from '@defjs/core'
import { context, type TextMapPropagator, type Tracer, trace } from '@opentelemetry/api'
import { queryStringSetter } from '../propagation/carrier'
import type { RequestLogger } from '../telemetry/logs'
import type { RequestMetrics } from '../telemetry/metrics'
import { createWebSocketSpan, endSpan, setSpanError } from '../telemetry/trace'

export interface WebSocketInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: RequestMetrics
  logger?: RequestLogger
  queryPropagation?: boolean
}

export function createOpenTelemetryWebSocketInterceptor(
  options: WebSocketInterceptorOptions,
): ReturnType<typeof createWebSocketInterceptor> {
  return createWebSocketInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, logger, queryPropagation = true } = options

    let url = req.endpoint
    if (req.baseEndpoint) {
      try {
        url = new URL(req.endpoint, req.baseEndpoint).toString()
      } catch {
        // keep endpoint as-is
      }
    }

    const span = createWebSocketSpan(tracer, url)
    const spanCtx = trace.setSpan(context.active(), span)

    // Inject context into query string
    let queryParams = req.queryParams
    let queryString = req.queryString

    if (queryPropagation) {
      const carrier = { params: new URLSearchParams(queryParams) }
      propagator.inject(spanCtx, carrier, queryStringSetter)
      queryParams = carrier.params
      queryString = carrier.params.toString()
    }

    const startTime = performance.now()

    try {
      const session = await next({
        ...req,
        queryParams,
        queryString,
      })

      const durationMs = performance.now() - startTime

      span.addEvent('websocket.connected', {
        duration_ms: durationMs,
      })

      // Track session lifecycle
      session.closed.then(
        () => {
          span.addEvent('websocket.closed')
          endSpan(span)
        },
        (error: unknown) => {
          span.addEvent('websocket.error')
          setSpanError(span, error)
        },
      )

      metrics?.requestCounter.add(1, {})
      metrics?.durationHistogram.record(durationMs, {})

      return session
    } catch (error) {
      const durationMs = performance.now() - startTime

      setSpanError(span, error)

      metrics?.errorCounter.add(1, {})
      metrics?.durationHistogram.record(durationMs, {})

      throw error
    }
  })
}
