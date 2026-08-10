import type { Attributes, Context } from '@opentelemetry/api'
import type { Span, Tracer } from '@opentelemetry/api'
import { SpanKind, SpanStatusCode } from '@opentelemetry/api'

const spanStatusSet = new WeakMap<Span, boolean>()

function markSpanStatusSet(span: Span): void {
  spanStatusSet.set(span, true)
}

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

export function createSSESpan(tracer: Tracer, url: string, parentCtx: Context): Span {
  return tracer.startSpan(
    'SSE',
    {
      kind: SpanKind.CLIENT,
      attributes: { 'url.full': url },
    },
    parentCtx,
  )
}

export function createWebSocketSpan(tracer: Tracer, url: string, parentCtx: Context): Span {
  return tracer.startSpan(
    'WebSocket',
    {
      kind: SpanKind.CLIENT,
      attributes: { 'url.full': url },
    },
    parentCtx,
  )
}

export function setSpanHttpResponse(span: Span, status: number): void {
  span.setAttribute('http.response.status_code', status)
  span.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK })
  markSpanStatusSet(span)
  span.end()
}

export function setSpanError(span: Span, error: unknown): void {
  span.recordException(toError(error))
  span.setStatus({ code: SpanStatusCode.ERROR })
  markSpanStatusSet(span)
  span.end()
}

export function endSpan(span: Span): void {
  if (!spanStatusSet.has(span)) {
    span.setStatus({ code: SpanStatusCode.OK })
  }
  span.end()
}

export function runSpanHook(span: Span, hookName: string, hook: (() => Promise<void> | void) | undefined): void {
  if (!hook) {
    return
  }
  try {
    const result = hook()
    void Promise.resolve(result).catch((error) => recordSpanHookError(span, hookName, error))
  } catch (error) {
    recordSpanHookError(span, hookName, error)
  }
}

function recordSpanHookError(span: Span, hookName: string, error: unknown): void {
  try {
    span.addEvent('defjs.otel.hook.error', {
      'hook.name': hookName,
      'error.type': getErrorType(error),
    })
  } catch {
    // Telemetry hooks must not affect transport execution.
  }
  try {
    span.recordException(toError(error))
  } catch {
    // Telemetry hooks must not affect transport execution.
  }
}

export function addSpanEvent(span: Span, eventName: string, attributes?: Attributes): void {
  if (attributes) {
    span.addEvent(eventName, attributes)
    return
  }
  span.addEvent(eventName)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'Error'
  }
  if (typeof error === 'string') {
    return error
  }
  return typeof error
}
