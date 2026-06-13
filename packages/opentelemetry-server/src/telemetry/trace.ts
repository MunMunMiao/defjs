import type { Context } from '@opentelemetry/api'
import type { Span, Tracer } from '@opentelemetry/api'
import { SpanKind, SpanStatusCode } from '@opentelemetry/api'

export function createHttpSpan(tracer: Tracer, method: string, url: string, parentCtx: Context): Span {
  return tracer.startSpan(
    `HTTP ${method}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': method,
        'url.full': url,
      },
    },
    parentCtx,
  )
}

export function createSseSpan(tracer: Tracer, url: string, parentCtx: Context): Span {
  return tracer.startSpan(
    'SSE connect',
    {
      kind: SpanKind.CLIENT,
      attributes: { 'url.full': url },
    },
    parentCtx,
  )
}

export function createWebSocketSpan(tracer: Tracer, url: string, parentCtx: Context): Span {
  return tracer.startSpan(
    'WebSocket connect',
    {
      kind: SpanKind.CLIENT,
      attributes: { 'url.full': url },
    },
    parentCtx,
  )
}

export function setSpanHttpResponse(span: Span, status: number): void {
  span.setAttribute('http.response.status_code', status)
  span.setStatus({ code: status >= 200 && status < 300 ? SpanStatusCode.OK : SpanStatusCode.ERROR })
  span.end()
}

export function setSpanError(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error))
  span.recordException(err)
  span.setStatus({ code: SpanStatusCode.ERROR })
  span.end()
}

export function endSpan(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK })
  span.end()
}
