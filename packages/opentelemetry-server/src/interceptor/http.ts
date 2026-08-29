import type { HttpRequest, HttpResponse } from '@defjs/core'
import { createHttpInterceptor } from '@defjs/core'
import type { Attributes, Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'
import { headersGetter, headersSetter } from '../propagation/carrier'
import type { HttpClientMetrics } from '../telemetry/metrics'
import { createHttpMetricAttributes, durationSeconds } from '../telemetry/metrics'
import { createHttpSpan, resolveStartSpanHook, runSpanHook, setSpanError, setSpanHttpResponse } from '../telemetry/trace'
import { resolveHttpUrl } from '../telemetry/url'

export interface HttpInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: HttpClientMetrics
  requireParentSpan?: boolean
  startSpanHook?: (request: HttpRequest) => Attributes
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, res: HttpResponse<unknown>, req: HttpRequest) => Promise<void> | void
}

export function createOpenTelemetryHttpInterceptor(options: HttpInterceptorOptions): ReturnType<typeof createHttpInterceptor> {
  return createHttpInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan, startSpanHook, requestHook, responseHook } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)
    const { url, serverAddress, serverPort } = resolveHttpUrl(req.endpoint, req.baseEndpoint)
    const startSpanHookResult = resolveStartSpanHook(startSpanHook, req)
    const span = createHttpSpan(tracer, req.method, url, parentCtx, req.operation, {
      ...(serverAddress ? { 'server.address': serverAddress } : {}),
      ...(serverPort ? { 'server.port': serverPort } : {}),
      ...(startSpanHookResult.ok ? startSpanHookResult.attributes : {}),
    })

    if (!startSpanHookResult.ok) {
      runSpanHook(span, 'startSpanHook', () => {
        throw startSpanHookResult.error
      })
    }

    runSpanHook(span, 'requestHook', () => requestHook?.(span, req))

    const spanCtx = trace.setSpan(parentCtx, span)
    const headers = req.headers instanceof Headers ? req.headers : new Headers(req.headers)
    propagator.inject(spanCtx, headers, headersSetter)

    const startTime = performance.now()

    try {
      const response = await next({ ...req, headers })
      const durationS = durationSeconds(startTime)

      runSpanHook(span, 'responseHook', () => responseHook?.(span, response, req))
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
