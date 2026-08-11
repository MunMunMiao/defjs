import type { EventStreamCloseInfo, EventStreamHandle, HttpRequest } from '@defjs/core'
import { createSSEInterceptor } from '@defjs/core'
import type { Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'
import { headersGetter, headersSetter } from '../propagation/carrier'
import type { SSEClientMetrics } from '../telemetry/metrics'
import {
  createConnectionMetricAttributes,
  createErrorMetricAttributes,
  createServerMetricAttributes,
  durationSeconds,
} from '../telemetry/metrics'
import { addSpanEvent, createSSESpan, endSpan, runSpanHook, setSpanError } from '../telemetry/trace'
import { resolveUrl } from '../telemetry/url'

export interface SSEInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: SSEClientMetrics
  requireParentSpan?: boolean
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, stream: EventStreamHandle<unknown>, req: HttpRequest) => Promise<void> | void
}

export function createOpenTelemetrySSEInterceptor(options: SSEInterceptorOptions): ReturnType<typeof createSSEInterceptor> {
  return createSSEInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan, requestHook, responseHook } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)
    const url = resolveUrl(req.endpoint, req.baseEndpoint)

    const span = createSSESpan(tracer, url, parentCtx, req.operation)
    const spanCtx = trace.setSpan(parentCtx, span)
    const headers = req.headers instanceof Headers ? req.headers : new Headers(req.headers)
    propagator.inject(spanCtx, headers, headersSetter)

    runSpanHook(span, 'requestHook', () => requestHook?.(span, req))

    const connectStartMs = performance.now()

    try {
      const stream = await next({ ...req, headers })
      const connectedAtMs = performance.now()
      const activeAttributes = createServerMetricAttributes(req)

      runSpanHook(span, 'responseHook', () => responseHook?.(span, stream, req))
      addSpanEvent(span, 'sse.connected')

      metrics?.connectDuration.record(durationSeconds(connectStartMs, connectedAtMs), createConnectionMetricAttributes(req, 'success'))
      metrics?.activeStreams.add(1, activeAttributes)

      const closeActiveStream = () => {
        metrics?.activeStreams.add(-1, activeAttributes)
      }

      stream.closed.then(
        (closeInfo: EventStreamCloseInfo) => {
          closeActiveStream()
          const closeAttributes = {
            'sse.close.code': closeInfo.code,
            ...(closeInfo.code === 'error' ? { 'defjs.sse.error.code': closeInfo.errorCode } : {}),
          }

          if (closeInfo.code === 'error') {
            addSpanEvent(span, 'sse.error', closeAttributes)
            metrics?.connectionDuration.record(
              durationSeconds(connectedAtMs),
              createConnectionMetricAttributes(req, 'error', {
                ...closeAttributes,
                ...createErrorMetricAttributes(closeInfo.cause),
              }),
            )
            setSpanError(span, closeInfo.cause)
            return
          }

          addSpanEvent(span, closeInfo.code === 'aborted' ? 'sse.aborted' : 'sse.closed', closeAttributes)
          metrics?.connectionDuration.record(
            durationSeconds(connectedAtMs),
            createConnectionMetricAttributes(req, 'success', closeAttributes),
          )
          endSpan(span)
        },
        (error: unknown) => {
          closeActiveStream()
          addSpanEvent(span, 'sse.error', createErrorMetricAttributes(error))
          metrics?.connectionDuration.record(
            durationSeconds(connectedAtMs),
            createConnectionMetricAttributes(req, 'error', createErrorMetricAttributes(error)),
          )
          setSpanError(span, error)
        },
      )

      return stream
    } catch (error) {
      metrics?.connectDuration.record(
        durationSeconds(connectStartMs),
        createConnectionMetricAttributes(req, 'error', createErrorMetricAttributes(error)),
      )
      setSpanError(span, error)
      throw error
    }
  })
}
