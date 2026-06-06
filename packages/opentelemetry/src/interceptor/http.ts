import { createHttpInterceptor } from '@defjs/core'
import { propagation, context, trace, type TextMapPropagator, type Tracer } from '@opentelemetry/api'
import { headersGetter, headersSetter } from '../propagation/carrier'
import { createHttpSpan, setSpanHttpResponse, setSpanError } from '../telemetry/trace'
import type { RequestMetrics } from '../telemetry/metrics'
import type { RequestLogger } from '../telemetry/logs'

export interface HttpInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: RequestMetrics
  logger?: RequestLogger
  recordBodies?: boolean
  recordHeaders?: boolean
}

export function createOpenTelemetryHttpInterceptor(options: HttpInterceptorOptions): ReturnType<typeof createHttpInterceptor> {
  return createHttpInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, logger, recordBodies, recordHeaders } = options

    // Extract context from incoming headers
    const parentCtx = propagation.extract(context.active(), req.headers ?? new Headers(), headersGetter)

    // Build URL for attributes
    let url = req.endpoint
    if (req.baseEndpoint) {
      try {
        url = new URL(req.endpoint, req.baseEndpoint).toString()
      } catch {
        // keep endpoint as-is
      }
    }

    // Create span with parent context
    const span = tracer.startSpan(`HTTP ${req.method}`, {
      kind: 2, // SpanKind.CLIENT
      attributes: {
        'http.request.method': req.method,
        'url.full': url,
      },
    }, parentCtx)

    const spanCtx = trace.setSpan(parentCtx, span)

    // Inject context into outgoing headers
    const headers = new Headers(req.headers)
    propagation.inject(spanCtx, headers, headersSetter)

    const startTime = performance.now()

    logger?.logRequest(req.method, url)

    try {
      const response = await next({
        ...req,
        headers,
      })

      const durationMs = performance.now() - startTime

      setSpanHttpResponse(span, response.status)

      metrics?.requestCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationMs, { 'http.request.method': req.method })

      logger?.logResponse(req.method, url, response.status, durationMs)

      return response
    } catch (error) {
      const durationMs = performance.now() - startTime

      setSpanError(span, error)

      metrics?.errorCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationMs, { 'http.request.method': req.method })

      logger?.logError(req.method, url, error)

      throw error
    }
  })
}
