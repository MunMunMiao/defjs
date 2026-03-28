import type { InterceptorFn } from './interceptor'
import { ERR_INVALID_CLIENT, ERR_INVALID_CLIENT_ENDPOINT, ERR_NOT_FOUND_GLOBAL_CLIENT } from './response'
import { fetchHandler, type HttpHandler } from './transport'

export type QueryParamsSerializer = (params: URLSearchParams) => string

export const DEFAULT_QUERY_PARAMS_SERIALIZER: QueryParamsSerializer = params => params.toString()

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
  handler?: HttpHandler
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
  http?: ClientHttpOptions
  interceptors?: InterceptorFn[]
  queryParamsSerializer?: QueryParamsSerializer
  sse?: ClientSseOptions
  webSocket?: ClientWebSocketOptions
  withCredentials?: boolean
}

export interface ClientConfig {
  endpoint: string
  http: Required<ClientHttpOptions>
  interceptors: InterceptorFn[]
  queryParamsSerializer: QueryParamsSerializer
  sse: Required<ClientSseOptions>
  webSocket: ClientWebSocketOptions
  withCredentials?: boolean
}

export const DEFAULT_HTTP_OPTIONS: Required<ClientHttpOptions> = {
  handler: fetchHandler,
}

export const DEFAULT_SSE_OPTIONS: Required<ClientSseOptions> = {
  fetch: ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch,
}

export const DEFAULT_WEB_SOCKET_OPTIONS: ClientWebSocketOptions = {
  beforeConnect: undefined,
  heartbeat: undefined,
  protocols: undefined,
  queue: undefined,
  reconnect: undefined,
}

const CLIENT = Symbol('Client')

export type Client = {
  readonly [CLIENT]: ClientConfig
}

let globalClient: Client | undefined

export function isClient(value: unknown): value is Client {
  return typeof value === 'object' && value !== null && CLIENT in value
}

export function getClientConfig(client: Client): ClientConfig {
  if (!isClient(client)) {
    throw ERR_INVALID_CLIENT
  }

  return client[CLIENT]
}

export function createClient(options: ClientOptions): Client {
  const conf: ClientConfig = {
    endpoint: normalizeClientEndpoint(options.endpoint),
    http: {
      ...DEFAULT_HTTP_OPTIONS,
      ...options.http,
    },
    interceptors: options.interceptors ?? [],
    queryParamsSerializer: options.queryParamsSerializer ?? DEFAULT_QUERY_PARAMS_SERIALIZER,
    sse: {
      ...DEFAULT_SSE_OPTIONS,
      ...options.sse,
    },
    webSocket: {
      ...DEFAULT_WEB_SOCKET_OPTIONS,
      ...options.webSocket,
      protocols: options.webSocket?.protocols ? [...options.webSocket.protocols] : DEFAULT_WEB_SOCKET_OPTIONS.protocols,
    },
    withCredentials: options.withCredentials,
  }

  return {
    [CLIENT]: conf,
  }
}

export function cloneClient(client: Client, options: Partial<ClientOptions>): Client {
  const prev = getClientConfig(client)

  return createClient({
    endpoint: options.endpoint ?? prev.endpoint,
    http: options.http
      ? {
          ...prev.http,
          ...options.http,
        }
      : prev.http,
    interceptors: options.interceptors ?? prev.interceptors,
    queryParamsSerializer: options.queryParamsSerializer ?? prev.queryParamsSerializer,
    sse: options.sse
      ? {
          ...prev.sse,
          ...options.sse,
        }
      : prev.sse,
    webSocket: options.webSocket
      ? {
          ...prev.webSocket,
          ...options.webSocket,
          protocols: options.webSocket.protocols ? [...options.webSocket.protocols] : prev.webSocket.protocols,
        }
      : prev.webSocket,
    withCredentials: options.withCredentials ?? prev.withCredentials,
  })
}

export function getGlobalClient(): Client {
  if (!globalClient) {
    throw ERR_NOT_FOUND_GLOBAL_CLIENT
  }

  return globalClient
}

export function setGlobalClient(client: Client): void {
  globalClient = client
}

export function restGlobalClient(): void {
  globalClient = undefined
}

export function createGlobalClient(options: ClientOptions): void {
  globalClient = createClient(options)
}

function normalizeClientEndpoint(endpoint: string): string {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }

  if (url.search || url.hash) {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }

  return url.toString()
}
