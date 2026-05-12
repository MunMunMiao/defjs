import type { ClientConfig, ClientOptions } from './config'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS, DEFAULT_WEB_SOCKET_OPTIONS } from './config'
import { getGlobalClient } from './global'
import { CLIENT, type Client, getClientConfig } from './resolve'

export function createClient(options: ClientOptions): Client {
  const conf: ClientConfig = {
    endpoint: options.endpoint,
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

  return { [CLIENT]: conf }
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

export function resolveClientConfig(client?: Client): ClientConfig {
  return getClientConfig(client ?? getGlobalClient())
}
