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

// Generic onion-chain builder — both HTTP and SSE chains share this shape.
function makeChain<TFn extends (req: HttpRequest, next: any) => any>(interceptors: TFn[]): TFn {
  return interceptors.reduceRight<TFn>(
    (fn, interceptor) => ((initReq: HttpRequest, finalHandlerFn: never) => interceptor(initReq, (req: HttpRequest) => fn(req, finalHandlerFn))) as TFn,
    ((req: HttpRequest, fn: (req: HttpRequest) => unknown) => fn(req)) as TFn,
  )
}

export function makeInterceptorChain(interceptors: InterceptorFn[]): InterceptorFn {
  return makeChain(interceptors)
}

export function makeSSEInterceptorChain(interceptors: SSEInterceptorFn[]): SSEInterceptorFn {
  return makeChain(interceptors)
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
