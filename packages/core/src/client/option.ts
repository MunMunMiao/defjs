import type { ClientConfig, ClientSseOptions, ClientWebSocketOptions, QueryParamsSerializer } from './config'
import type { Interceptor } from '../interceptor/interceptor'

export type ClientOption = (config: ClientConfig) => void

export function withEndpoint(endpoint: string): ClientOption {
  return config => {
    config.endpoint = endpoint
  }
}

export function withInterceptors(...interceptors: Interceptor[]): ClientOption {
  return config => {
    config.interceptors.push(...interceptors)
  }
}

export function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption {
  return config => {
    config.queryParamsSerializer = serializer
  }
}

export function withSseOptions(options: ClientSseOptions): ClientOption {
  return config => {
    config.sse = {
      ...config.sse,
      ...options,
    }
  }
}

export function withWebSocketOptions(options: ClientWebSocketOptions): ClientOption {
  return config => {
    config.webSocket = {
      ...config.webSocket,
      protocols: options.protocols ? [...options.protocols] : config.webSocket.protocols,
    }
    if (options.beforeConnect !== undefined) {
      config.webSocket.beforeConnect = options.beforeConnect
    }
    if (options.heartbeat !== undefined) {
      config.webSocket.heartbeat = options.heartbeat
    }
    if (options.queue !== undefined) {
      config.webSocket.queue = options.queue
    }
    if (options.reconnect !== undefined) {
      config.webSocket.reconnect = options.reconnect
    }
  }
}

export function withCredentials(value: boolean): ClientOption {
  return config => {
    config.withCredentials = value
  }
}
