import type { Interceptor } from '../interceptor/interceptor'

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

export interface ClientSseOptions {
  fetch?: typeof fetch
}

export interface ClientWebSocketOptions {
  beforeConnect?: WebSocketBeforeConnect
  heartbeat?: WebSocketHeartbeatOptions
  protocols?: readonly string[]
  queue?: WebSocketQueueOptions
  reconnect?: WebSocketReconnectOptions
}

export interface ClientOptions {
  endpoint: string
  interceptors?: Interceptor[]
  queryParamsSerializer?: QueryParamsSerializer
  sse?: ClientSseOptions
  webSocket?: ClientWebSocketOptions
  withCredentials?: boolean
}

export interface ClientConfig {
  endpoint: string
  interceptors: Interceptor[]
  queryParamsSerializer: QueryParamsSerializer
  sse: Required<ClientSseOptions>
  webSocket: ClientWebSocketOptions
  withCredentials?: boolean
}

export const DEFAULT_SSE_OPTIONS: Required<ClientSseOptions> = {
  fetch: globalThis.fetch.bind(globalThis) as typeof fetch,
}
