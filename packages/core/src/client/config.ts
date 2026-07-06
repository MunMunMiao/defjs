import type { Interceptor } from '../interceptor/interceptor'
import type { HttpRequest } from '../internal/http_request'

export type QueryParamsSerializer = (params: URLSearchParams, rawParams?: { [key: string]: unknown }) => string

export const DEFAULT_QUERY_PARAMS_SERIALIZER: QueryParamsSerializer = (params) => params.toString()

export interface ClientWebSocketOptions {
  handle?: typeof WebSocket
  beforeConnect?: () => void | Promise<void>
  heartbeat?: {
    intervalMs: number
    isAck?: (message: unknown) => boolean
    message?: <T = unknown>() => T | unknown
    timeoutMs?: number
  }
  protocols?: readonly string[]
  queue?: { maxSize?: number; overflow?: 'drop-newest' | 'drop-oldest' | 'error' }
  reconnect?: {
    attempts?: number
    delayMs?: number
    factor?: number
    jitter?: number
    maxDelayMs?: number
    shouldReconnect?: (context: { attempt: number; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }) => boolean
  }
}

export interface ClientSSEOptions {
  handle?: typeof fetch
  onInvalidEvent?: (context: {
    reason: 'missing-struct' | 'validation-failed'
    message: { id: string; event: string; data: string; retry?: number }
    cause?: unknown
  }) => void | Promise<void>
  reconnect?: {
    attempts?: number
    delayMs?: number
    factor?: number
    jitter?: number
    maxDelayMs?: number
    shouldReconnect?: (context: {
      attempt: number
      cause?: unknown
      lastEventId: string
      open?: { response: { status: number; statusText: string; url: string }; url: string }
    }) => boolean | Promise<boolean>
  }
  queue?: { maxSize?: number; overflow?: 'drop-newest' | 'drop-oldest' | 'error' }
  maxBufferSize?: number
}

export type ClientSSEConfig = ClientSSEOptions & { handle: typeof fetch }

export interface ClientOptions {
  endpoint: string
  http?: { handle?: typeof fetch }
  interceptors?: Interceptor[]
  queryParamsSerializer?: QueryParamsSerializer
  sse?: ClientSSEOptions
  webSocket?: ClientWebSocketOptions
  xsrf?: {
    cookieName?: string
    headerName?: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
  withCredentials?: boolean
}

export interface ClientConfig {
  endpoint: string
  http: { handle: typeof fetch }
  interceptors: Interceptor[]
  queryParamsSerializer: QueryParamsSerializer
  sse: ClientSSEConfig
  webSocket: ClientWebSocketOptions
  xsrf?: {
    cookieName: string
    headerName: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
  withCredentials?: boolean
}

const DEFAULT_FETCH = globalThis.fetch.bind(globalThis) as typeof fetch

export const DEFAULT_HTTP_OPTIONS: { handle: typeof fetch } = {
  handle: DEFAULT_FETCH,
}

export const DEFAULT_SSE_OPTIONS: ClientSSEConfig = {
  handle: DEFAULT_FETCH,
  onInvalidEvent: undefined,
  reconnect: undefined,
  queue: undefined,
  maxBufferSize: undefined,
}
