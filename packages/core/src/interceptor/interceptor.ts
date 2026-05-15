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
// WebSocket Interceptor
// ---------------------------------------------------------------------------

// Minimal session interface — structurally compatible with WebSocketSession
// to avoid circular dependency (interceptor.ts ←→ web_socket.ts).
export interface WebSocketSessionLike {
  readonly connection: { extensions?: string; protocol?: string; url?: string }
  readonly closed: Promise<unknown>
  readonly receive: AsyncIterable<unknown>
  readonly state: string
  close(code?: number, reason?: string): void
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: string) => void): () => void
  send(message: unknown): void
}

export type WebSocketHandler = (req: HttpRequest) => Promise<WebSocketSessionLike>

export type WebSocketInterceptorFn = (req: HttpRequest, next: WebSocketHandler) => Promise<WebSocketSessionLike>

export interface WebSocketInterceptor {
  kind: 'web-socket'
  fn: WebSocketInterceptorFn
}

export function createWebSocketInterceptor(fn: WebSocketInterceptorFn): WebSocketInterceptor {
  return { kind: 'web-socket', fn }
}

// ---------------------------------------------------------------------------
// Unified type
// ---------------------------------------------------------------------------

export type Interceptor = HttpInterceptor | SSEInterceptor | WebSocketInterceptor

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

// Generic onion-chain builder — HTTP, SSE, and WebSocket chains share this shape.
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

export function makeWebSocketInterceptorChain(interceptors: WebSocketInterceptorFn[]): WebSocketInterceptorFn {
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

export function resolveWebSocketInterceptors(interceptors: Interceptor[]): WebSocketInterceptorFn[] {
  return interceptors.filter((i): i is WebSocketInterceptor => i.kind === 'web-socket').map(i => i.fn)
}
