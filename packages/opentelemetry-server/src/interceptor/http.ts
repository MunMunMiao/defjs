import type { HttpRequest, HttpResponse } from '@defjs/core'
import { createHttpInterceptor } from '@defjs/core'
import type { Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'
import { headersGetter, headersSetter } from '../propagation/carrier'
import type { HttpClientMetrics } from '../telemetry/metrics'
import { createHttpMetricAttributes, durationSeconds } from '../telemetry/metrics'
import { createHttpSpan, runSpanHook, setSpanError, setSpanHttpResponse } from '../telemetry/trace'
import { resolveHttpUrl } from '../telemetry/url'

export interface HttpInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: HttpClientMetrics
  requireParentSpan?: boolean
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, res: HttpResponse<unknown>) => Promise<void> | void
}

export function createOpenTelemetryHttpInterceptor(options: HttpInterceptorOptions): ReturnType<typeof createHttpInterceptor> {
  return createHttpInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan, requestHook, responseHook } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)
    const { url, serverAddress, serverPort } = resolveHttpUrl(req.endpoint, req.baseEndpoint)

    const span = createHttpSpan(tracer, req.method, url, parentCtx)

    if (serverAddress) {
      span.setAttribute('server.address', serverAddress)
    }
    if (serverPort) {
      span.setAttribute('server.port', serverPort)
    }

    runSpanHook(span, 'requestHook', () => requestHook?.(span, req))

    const spanCtx = trace.setSpan(parentCtx, span)
    const headers = req.headers instanceof Headers ? req.headers : new Headers(req.headers)
    propagator.inject(spanCtx, headers, headersSetter)

    const startTime = performance.now()

    try {
      const response = await next({ ...req, headers })
      const durationS = durationSeconds(startTime)

      runSpanHook(span, 'responseHook', () => responseHook?.(span, response))
      setSpanHttpResponse(span, response.status, response.error)

      metrics?.requestDuration.record(durationS, createHttpMetricAttributes(req, response))

      return response
    } catch (error) {
      const durationS = durationSeconds(startTime)

      setSpanError(span, error)
      metrics?.requestDuration.record(durationS, createHttpMetricAttributes(req, undefined, error))

      throw error
    }
  })
}
