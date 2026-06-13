import type { Interceptor } from '../interceptor/interceptor'
import type { HttpRequest } from '../internal/http_request'

export type QueryParamsSerializer = (params: URLSearchParams, rawParams?: Record<string, unknown>) => string

export const DEFAULT_QUERY_PARAMS_SERIALIZER: QueryParamsSerializer = (params) => params.toString()

export type WebSocketBeforeConnect = () => void | Promise<void>

export interface WebSocketReconnectOptions {
  attempts?: number
  delayMs?: number
  factor?: number
  jitter?: number
  maxDelayMs?: number
  shouldReconnect?: (context: { attempt: number; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }) => boolean
}

export interface WebSocketHeartbeatOptions {
  intervalMs: number
  isAck?: (message: unknown) => boolean
  message?: <T = unknown>() => T | unknown
  timeoutMs?: number
}

export interface WebSocketQueueOptions {
  maxSize?: number
  overflow?: 'drop-newest' | 'drop-oldest' | 'error'
}

export interface ClientHttpOptions {
  fetch?: typeof fetch
}

export interface XSRFTokenProviderContext {
  request: HttpRequest
}

export type XSRFTokenProvider = (context: XSRFTokenProviderContext) => string | null | undefined

export interface ClientXSRFOptions {
  cookieName?: string
  headerName?: string
  tokenProvider?: XSRFTokenProvider
}

export interface ClientXSRFConfig {
  cookieName: string
  headerName: string
  tokenProvider?: XSRFTokenProvider
}

export type SSEInvalidEventReason = 'missing-schema' | 'validation-failed'

export interface SSEInvalidEventMessage {
  id: string
  event: string
  data: string
  retry?: number
}

export interface SSEInvalidEventContext {
  reason: SSEInvalidEventReason
  message: SSEInvalidEventMessage
  cause?: unknown
}

export type SSEInvalidEventHandler = (context: SSEInvalidEventContext) => void | Promise<void>

export interface SSEReconnectOptions {
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

export interface SSEQueueOptions {
  maxSize?: number
  overflow?: 'drop-newest' | 'drop-oldest' | 'error'
}

export interface ClientSSEOptions {
  fetch?: typeof fetch
  onInvalidEvent?: SSEInvalidEventHandler
  reconnect?: SSEReconnectOptions
  queue?: SSEQueueOptions
  maxBufferSize?: number
}

export interface ClientSSEConfig {
  fetch: typeof fetch
  onInvalidEvent?: SSEInvalidEventHandler
  reconnect?: SSEReconnectOptions
  queue?: SSEQueueOptions
  maxBufferSize?: number
}

export interface ClientWebSocketOptions {
  WebSocket?: typeof WebSocket
  beforeConnect?: WebSocketBeforeConnect
  heartbeat?: WebSocketHeartbeatOptions
  protocols?: readonly string[]
  queue?: WebSocketQueueOptions
  reconnect?: WebSocketReconnectOptions
}

export interface ClientOptions {
  endpoint: string
  http?: ClientHttpOptions
  interceptors?: Interceptor[]
  queryParamsSerializer?: QueryParamsSerializer
  sse?: ClientSSEOptions
  webSocket?: ClientWebSocketOptions
  xsrf?: ClientXSRFOptions
  withCredentials?: boolean
}

export interface ClientConfig {
  endpoint: string
  http: Required<ClientHttpOptions>
  interceptors: Interceptor[]
  queryParamsSerializer: QueryParamsSerializer
  sse: ClientSSEConfig
  webSocket: ClientWebSocketOptions
  xsrf?: ClientXSRFConfig
  withCredentials?: boolean
}

const DEFAULT_FETCH = globalThis.fetch.bind(globalThis) as typeof fetch

export const DEFAULT_HTTP_OPTIONS: Required<ClientHttpOptions> = {
  fetch: DEFAULT_FETCH,
}

export const DEFAULT_SSE_OPTIONS: ClientSSEConfig = {
  fetch: DEFAULT_FETCH,
  onInvalidEvent: undefined,
  reconnect: undefined,
  queue: undefined,
  maxBufferSize: undefined,
}
