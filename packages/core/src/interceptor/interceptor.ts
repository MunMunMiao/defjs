import type { HttpHandler } from '../http/transport/handler'
import type { HttpRequest } from '../internal/http_request'
import type { HttpResponse } from '../internal/http_response'
import type { EventStreamHandle } from '../sse/transport/event_stream'

// ---------------------------------------------------------------------------
// HTTP Interceptor
// ---------------------------------------------------------------------------

export type InterceptorFn = (req: HttpRequest, next: HttpHandler) => Promise<HttpResponse<unknown>>

export interface HttpInterceptor {
  kind: 'http'
  fn: InterceptorFn
}

export function createHttpInterceptor(fn: InterceptorFn): HttpInterceptor {
  return { kind: 'http', fn }
}

// ---------------------------------------------------------------------------
// SSE Interceptor
// ---------------------------------------------------------------------------

export type SSEHandler = (req: HttpRequest) => Promise<EventStreamHandle<unknown>>

export type SSEInterceptorFn = (req: HttpRequest, next: SSEHandler) => Promise<EventStreamHandle<unknown>>

export interface SSEInterceptor {
  kind: 'sse'
  fn: SSEInterceptorFn
}

export function createSSEInterceptor(fn: SSEInterceptorFn): SSEInterceptor {
  return { kind: 'sse', fn }
}

// ---------------------------------------------------------------------------
// Unified type
// ---------------------------------------------------------------------------

export type Interceptor = HttpInterceptor | SSEInterceptor

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

export function makeInterceptorChain(interceptors: InterceptorFn[]): InterceptorFn {
  return interceptors.reduceRight(
    (fn, interceptor) => {
      return (initReq, finalHandlerFn) => interceptor(initReq, req => fn(req, finalHandlerFn))
    },
    (req: HttpRequest, fn: HttpHandler) => fn(req),
  )
}

export function makeSSEInterceptorChain(interceptors: SSEInterceptorFn[]): SSEInterceptorFn {
  return interceptors.reduceRight(
    (fn, interceptor) => {
      return (initReq, finalHandlerFn) => interceptor(initReq, req => fn(req, finalHandlerFn))
    },
    (req: HttpRequest, fn: SSEHandler) => fn(req),
  )
}

// ---------------------------------------------------------------------------
// Resolvers – extract typed interceptor fns from the mixed array
// ---------------------------------------------------------------------------

export function resolveHttpInterceptors(interceptors: Interceptor[]): InterceptorFn[] {
  return interceptors.filter((i): i is HttpInterceptor => i.kind === 'http').map(i => i.fn)
}

export function resolveSSEInterceptors(interceptors: Interceptor[]): SSEInterceptorFn[] {
  return interceptors.filter((i): i is SSEInterceptor => i.kind === 'sse').map(i => i.fn)
}
