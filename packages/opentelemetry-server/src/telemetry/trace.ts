import { type Span, SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api'

export interface SpanContext {
  span: Span
}

export function createHttpSpan(tracer: Tracer, method: string, url: string): Span {
  return tracer.startSpan(`HTTP ${method}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.request.method': method,
      'url.full': url,
    },
  })
}

export function createSseSpan(tracer: Tracer, url: string): Span {
  return tracer.startSpan('SSE connect', {
    kind: SpanKind.CLIENT,
    attributes: {
      'url.full': url,
    },
  })
}

export function createWebSocketSpan(tracer: Tracer, url: string): Span {
  return tracer.startSpan('WebSocket connect', {
    kind: SpanKind.CLIENT,
    attributes: {
      'url.full': url,
    },
  })
}

export function setSpanHttpResponse(span: Span, status: number): void {
  span.setAttribute('http.response.status_code', status)

  if (status >= 200 && status < 300) {
    span.setStatus({ code: SpanStatusCode.OK })
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR })
  }

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
