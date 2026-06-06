import type { ClientConfig } from './config'
import { DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import { getGlobalClient } from './global'
import { CLIENT, type Client, getClientConfig } from './resolve'
import type { ClientOption } from './option'

export function createClient(...options: ClientOption[]): Client {
  const conf: ClientConfig = {
    endpoint: '',
    interceptors: [],
    queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
    sse: { ...DEFAULT_SSE_OPTIONS },
    webSocket: {},
  }

  for (const option of options) {
    option(conf)
  }

  return { [CLIENT]: conf }
}

export function cloneClient(client: Client, ...options: ClientOption[]): Client {
  const prev = getClientConfig(client)

  const conf: ClientConfig = {
    endpoint: prev.endpoint,
    interceptors: [...prev.interceptors],
    queryParamsSerializer: prev.queryParamsSerializer,
    sse: { ...prev.sse },
    webSocket: {
      ...prev.webSocket,
      protocols: prev.webSocket.protocols ? [...prev.webSocket.protocols] : undefined,
    },
    withCredentials: prev.withCredentials,
  }

  for (const option of options) {
    option(conf)
  }

  return { [CLIENT]: conf }
}

export function resolveClientConfig(client?: Client): ClientConfig {
  return getClientConfig(client ?? getGlobalClient())
}
