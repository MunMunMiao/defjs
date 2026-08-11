import type { HttpRequest, WebSocketSessionLike } from '@defjs/core'
import { createWebSocketInterceptor, ERR_ABORTED } from '@defjs/core'
import type { Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'
import { headersGetter, queryStringSetter } from '../propagation/carrier'
import type { WebSocketClientMetrics } from '../telemetry/metrics'
import {
  createConnectionMetricAttributes,
  createErrorMetricAttributes,
  createServerMetricAttributes,
  durationSeconds,
} from '../telemetry/metrics'
import { addSpanEvent, createWebSocketSpan, endSpan, runSpanHook, setSpanError } from '../telemetry/trace'
import { resolveUrl } from '../telemetry/url'

export interface WebSocketInterceptorOptions {
  tracer: Tracer
  propagator: TextMapPropagator
  metrics?: WebSocketClientMetrics
  requireParentSpan?: boolean
  queryPropagation?: boolean
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, session: WebSocketSessionLike, req: HttpRequest) => Promise<void> | void
}

export function createOpenTelemetryWebSocketInterceptor(
  options: WebSocketInterceptorOptions,
): ReturnType<typeof createWebSocketInterceptor> {
  return createWebSocketInterceptor(async (req, next) => {
    const { tracer, propagator, metrics, requireParentSpan, queryPropagation = false, requestHook, responseHook } = options

    if (requireParentSpan && !trace.getActiveSpan()) {
      return next(req)
    }

    const url = resolveUrl(req.endpoint, req.baseEndpoint)

    const parentCtx = propagator.extract(context.active(), req.headers ?? new Headers(), headersGetter)
    const span = createWebSocketSpan(tracer, url, parentCtx, req.operation)
    const spanCtx = trace.setSpan(parentCtx, span)

    let queryParams = req.queryParams
    let queryString = req.queryString

    if (queryPropagation) {
      const originalParams = new URLSearchParams(queryParams)
      const carrier = { params: new URLSearchParams(queryParams) }
      propagator.inject(spanCtx, carrier, queryStringSetter)
      queryParams = carrier.params
      queryString = appendInjectedQueryString(queryString, originalParams, carrier.params)
    }

    runSpanHook(span, 'requestHook', () => requestHook?.(span, req))

    const connectStartMs = performance.now()

    try {
      const session = await next({ ...req, queryParams, queryString })
      const connectedAtMs = performance.now()
      const activeAttributes = createServerMetricAttributes(req)

      runSpanHook(span, 'responseHook', () => responseHook?.(span, session, req))
      addSpanEvent(span, 'websocket.connected')

      metrics?.connectDuration.record(durationSeconds(connectStartMs, connectedAtMs), createConnectionMetricAttributes(req, 'success'))
      metrics?.activeConnections.add(1, activeAttributes)

      const closeActiveConnection = () => {
        metrics?.activeConnections.add(-1, activeAttributes)
      }

      session.closed.then(
        (closeInfo: unknown) => {
          closeActiveConnection()
          const runtimeCloseInfo =
            typeof closeInfo === 'object' && closeInfo !== null ? (closeInfo as { cause?: unknown; kind?: unknown }) : {}
          const closeKind = runtimeCloseInfo.kind
          const closeCause = runtimeCloseInfo.cause
          const failed = typeof closeKind === 'string' ? closeKind !== 'closed' : typeof closeCause !== 'undefined'
          if (failed) {
            const error = typeof closeKind === 'string' ? (closeKind === 'error' ? closeCause : (closeCause ?? ERR_ABORTED)) : closeCause
            addSpanEvent(span, 'websocket.error', createErrorMetricAttributes(error))
            metrics?.connectionDuration.record(
              durationSeconds(connectedAtMs),
              createConnectionMetricAttributes(req, 'error', createErrorMetricAttributes(error)),
            )
            setSpanError(span, error)
            return
          }

          addSpanEvent(span, 'websocket.closed')
          metrics?.connectionDuration.record(durationSeconds(connectedAtMs), createConnectionMetricAttributes(req, 'success'))
          endSpan(span)
        },
        (error: unknown) => {
          closeActiveConnection()
          addSpanEvent(span, 'websocket.error', createErrorMetricAttributes(error))
          metrics?.connectionDuration.record(
            durationSeconds(connectedAtMs),
            createConnectionMetricAttributes(req, 'error', createErrorMetricAttributes(error)),
          )
          setSpanError(span, error)
        },
      )

      return session
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

function appendInjectedQueryString(queryString: string | undefined, originalParams: URLSearchParams, nextParams: URLSearchParams): string {
  const injectedParams = new URLSearchParams()

  nextParams.forEach((value, key) => {
    if (originalParams.getAll(key).includes(value)) {
      return
    }
    injectedParams.append(key, value)
  })

  const injectedQueryString = injectedParams.toString()
  if (!injectedQueryString) {
    return queryString ?? ''
  }
  if (!queryString) {
    return injectedQueryString
  }
  return `${queryString}&${injectedQueryString}`
}
