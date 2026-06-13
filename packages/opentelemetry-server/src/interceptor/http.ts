import { createHttpInterceptor } from '@defjs/core'
import type { Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'
import type { RequestMetrics } from '../option'
import { headersGetter, headersSetter } from '../propagation/carrier'
import { createHttpSpan, setSpanError, setSpanHttpResponse } from '../telemetry/trace'

export interface HttpInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: RequestMetrics
  requireParentSpan?: boolean
  requestHook?: (span: Span, req: unknown) => void
  responseHook?: (span: Span, res: unknown) => void
}

export function createOpenTelemetryHttpInterceptor(options: HttpInterceptorOptions): ReturnType<typeof createHttpInterceptor> {
  return createHttpInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan, requestHook, responseHook } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)

    let url = req.endpoint
    let serverAddress: string | undefined
    let serverPort: number | undefined

    if (req.baseEndpoint) {
      try {
        const parsed = new URL(req.endpoint, req.baseEndpoint)
        url = parsed.toString()
        serverAddress = parsed.hostname
        serverPort = Number.parseInt(parsed.port) || undefined
      } catch {
        url = req.endpoint
      }
    }

    const span = createHttpSpan(tracer, req.method, url, parentCtx)

    if (serverAddress) {
      span.setAttribute('server.address', serverAddress)
    }
    if (serverPort) {
      span.setAttribute('server.port', serverPort)
    }

    requestHook?.(span, req)

    const spanCtx = trace.setSpan(parentCtx, span)
    const headers = new Headers(req.headers)
    propagator.inject(spanCtx, headers, headersSetter)

    const startTime = performance.now()

    try {
      const response = await next({ ...req, headers })
      const durationS = (performance.now() - startTime) / 1000

      responseHook?.(span, response)
      setSpanHttpResponse(span, response.status)

      metrics?.requestCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationS, { 'http.request.method': req.method })

      return response
    } catch (error) {
      const durationS = (performance.now() - startTime) / 1000

      setSpanError(span, error)

      metrics?.requestCounter.add(1, { 'http.request.method': req.method })
      metrics?.errorCounter.add(1, { 'http.request.method': req.method })
      metrics?.durationHistogram.record(durationS, { 'http.request.method': req.method })

      throw error
    }
  })
}
