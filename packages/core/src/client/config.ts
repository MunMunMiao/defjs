import type { Interceptor } from '../interceptor/interceptor'
import type { HttpRequest } from '../internal/http_request'

export type QueryParamsSerializer = (params: URLSearchParams, rawParams?: { [key: string]: unknown }) => string

export const DEFAULT_QUERY_PARAMS_SERIALIZER: QueryParamsSerializer = (params) => params.toString()

export type WebSocketHandle = Omit<
  WebSocket,
  | 'binaryType'
  | 'CLOSED'
  | 'CLOSING'
  | 'CONNECTING'
  | 'dispatchEvent'
  | 'onclose'
  | 'onerror'
  | 'onmessage'
  | 'onopen'
  | 'OPEN'
  | 'readyState'
> & { readonly readyState: number }

export type WebSocketHandleConstructor = {
  readonly OPEN: number
} & (new (...args: never[]) => WebSocketHandle)

export interface ClientWebSocketOptions {
  handle?: WebSocketHandleConstructor
  beforeConnect?: (context: { attempt: number; signal: AbortSignal }) => void | Promise<void>
  heartbeat?: {
    intervalMs: number
    isAck?: (message: unknown) => boolean
    message?: <T = unknown>() => T | unknown
    timeoutMs?: number
  }
  protocols?: readonly string[]
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
    message: { id: string; event: string; data: string }
    cause?: unknown
    signal: AbortSignal
  }) => unknown
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
}

export interface ClientSSEConfig extends ClientSSEOptions {
  handle: typeof fetch
}

export interface HttpClientOptions {
  endpoint: string
  http?: { handle?: typeof fetch }
  interceptors?: Interceptor[]
  queryParamsSerializer?: QueryParamsSerializer
  xsrf?: {
    cookieName?: string
    headerName?: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
  withCredentials?: boolean
}

export interface ClientOptions extends HttpClientOptions {
  sse?: ClientSSEOptions
  webSocket?: ClientWebSocketOptions
}

export interface HttpClientConfig {
  endpoint: string
  http: { handle: typeof fetch }
  interceptors: Interceptor[]
  queryParamsSerializer: QueryParamsSerializer
  xsrf?: {
    cookieName: string
    headerName: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
  withCredentials?: boolean
}

export interface ClientConfig extends HttpClientConfig {
  sse: ClientSSEConfig
  webSocket: ClientWebSocketOptions
}

const DEFAULT_FETCH = globalThis.fetch.bind(globalThis) as typeof fetch

export const DEFAULT_HTTP_OPTIONS: { handle: typeof fetch } = {
  handle: DEFAULT_FETCH,
}

export const DEFAULT_SSE_OPTIONS: ClientSSEConfig = {
  handle: DEFAULT_FETCH,
  onInvalidEvent: undefined,
  reconnect: undefined,
}

export function createHttpClientConfig(): HttpClientConfig {
  return {
    endpoint: '',
    http: { ...DEFAULT_HTTP_OPTIONS },
    interceptors: [],
    queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
    xsrf: undefined,
  }
}

export function createClientConfig(): ClientConfig {
  return {
    ...createHttpClientConfig(),
    sse: { ...DEFAULT_SSE_OPTIONS },
    webSocket: {
      handle: globalThis.WebSocket,
      beforeConnect: undefined,
      heartbeat: undefined,
      protocols: undefined,
      reconnect: undefined,
    },
  }
}

export function applyClientOptions<TConfig>(config: TConfig, options: readonly ((config: TConfig) => void)[]): TConfig {
  for (const option of options) {
    option(config)
  }
  return config
}
