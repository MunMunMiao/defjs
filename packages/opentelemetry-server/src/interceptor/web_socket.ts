import { createWebSocketInterceptor } from '@defjs/core'
import { context, type TextMapPropagator, type Tracer, trace } from '@opentelemetry/api'
import type { RequestMetrics } from '../option'
import { headersGetter, queryStringSetter } from '../propagation/carrier'
import { createWebSocketSpan, endSpan, setSpanError } from '../telemetry/trace'

export interface WebSocketInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: RequestMetrics
  requireParentSpan?: boolean
  queryPropagation?: boolean
}

export function createOpenTelemetryWebSocketInterceptor(
  options: WebSocketInterceptorOptions,
): ReturnType<typeof createWebSocketInterceptor> {
  return createWebSocketInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan, queryPropagation = true } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    let url = req.endpoint
    if (req.baseEndpoint) {
      try {
        url = new URL(req.endpoint, req.baseEndpoint).toString()
      } catch {
        // keep as-is
      }
    }

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)
    const span = createWebSocketSpan(tracer, url, parentCtx)
    const spanCtx = trace.setSpan(parentCtx, span)

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
      const session = await next({ ...req, queryParams, queryString })
      const durationS = (performance.now() - startTime) / 1000

      span.addEvent('websocket.connected')

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
      metrics?.durationHistogram.record(durationS, {})

      return session
    } catch (error) {
      const durationS = (performance.now() - startTime) / 1000
      setSpanError(span, error)
      metrics?.errorCounter.add(1, {})
      metrics?.durationHistogram.record(durationS, {})
      throw error
    }
  })
}
