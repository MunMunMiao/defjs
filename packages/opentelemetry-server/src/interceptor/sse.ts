import { createSSEInterceptor } from '@defjs/core'
import { context, type TextMapPropagator, type Tracer, trace } from '@opentelemetry/api'
import type { RequestMetrics } from '../option'
import { headersGetter, headersSetter } from '../propagation/carrier'
import { createSseSpan, endSpan, setSpanError } from '../telemetry/trace'

export interface SseInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: RequestMetrics
  requireParentSpan?: boolean
}

export function createOpenTelemetrySseInterceptor(options: SseInterceptorOptions): ReturnType<typeof createSSEInterceptor> {
  return createSSEInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)
    let url = req.endpoint
    if (req.baseEndpoint) {
      try {
        url = new URL(req.endpoint, req.baseEndpoint).toString()
      } catch {
        // keep as-is
      }
    }

    const span = createSseSpan(tracer, url, parentCtx)
    const spanCtx = trace.setSpan(parentCtx, span)
    const headers = new Headers(req.headers)
    propagator.inject(spanCtx, headers, headersSetter)

    const startTime = performance.now()

    try {
      const stream = await next({ ...req, headers })
      const durationS = (performance.now() - startTime) / 1000

      span.addEvent('sse.connected')

      stream.closed.then(
        (closeInfo: { code: string; cause?: unknown }) => {
          if (closeInfo.code === 'error') {
            setSpanError(span, closeInfo.cause)
          } else {
            endSpan(span)
          }
        },
        (error: unknown) => setSpanError(span, error),
      )

      metrics?.requestCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationS, { 'http.request.method': req.method })

      return stream
    } catch (error) {
      const durationS = (performance.now() - startTime) / 1000
      setSpanError(span, error)
      metrics?.errorCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationS, { 'http.request.method': req.method })
      throw error
    }
  })
}
