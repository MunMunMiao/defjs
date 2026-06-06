import { createSSEInterceptor } from '@defjs/core'
import { context, trace, type TextMapPropagator, type Tracer } from '@opentelemetry/api'
import { headersGetter, headersSetter } from '../propagation/carrier'
import { createSseSpan, setSpanError, endSpan } from '../telemetry/trace'
import type { RequestMetrics } from '../telemetry/metrics'
import type { RequestLogger } from '../telemetry/logs'

export interface SseInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: RequestMetrics
  logger?: RequestLogger
}

export function createOpenTelemetrySseInterceptor(options: SseInterceptorOptions): ReturnType<typeof createSSEInterceptor> {
  return createSSEInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, logger } = options

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)

    let url = req.endpoint
    if (req.baseEndpoint) {
      try {
        url = new URL(req.endpoint, req.baseEndpoint).toString()
      } catch {
        // keep endpoint as-is
      }
    }

    const span = createSseSpan(tracer, url)
    const spanCtx = trace.setSpan(parentCtx, span)

    const headers = new Headers(req.headers)
    propagator.inject(spanCtx, headers, headersSetter)

    const startTime = performance.now()

    try {
      const stream = await next({
        ...req,
        headers,
      })

      const durationMs = performance.now() - startTime

      span.addEvent('sse.connected', {
        'duration_ms': durationMs,
      })

      // End span when stream closes
      stream.closed.then(
        (closeInfo: { code: string; cause?: unknown }) => {
          if (closeInfo.code === 'error') {
            setSpanError(span, closeInfo.cause)
          } else {
            endSpan(span)
          }
        },
        (error: unknown) => {
          setSpanError(span, error)
        },
      )

      metrics?.requestCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationMs, { 'http.request.method': req.method })

      return stream
    } catch (error) {
      const durationMs = performance.now() - startTime

      setSpanError(span, error)

      metrics?.errorCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationMs, { 'http.request.method': req.method })

      throw error
    }
  })
}
