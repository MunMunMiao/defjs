import type { Interceptor } from '../interceptor/interceptor'
import type {
  ClientConfig,
  ClientSSEOptions,
  ClientWebSocketOptions,
  ClientXSRFOptions,
  QueryParamsSerializer,
  SSEInvalidEventHandler,
  SSEQueueOptions,
  SSEReconnectOptions,
  WebSocketBeforeConnect,
  WebSocketHeartbeatOptions,
  WebSocketQueueOptions,
  WebSocketReconnectOptions,
} from './config'

export type ClientOption = (config: ClientConfig) => void

export function withEndpoint(endpoint: string): ClientOption {
  return (config) => {
    config.endpoint = endpoint
  }
}

export function withInterceptors(...interceptors: Interceptor[]): ClientOption {
  return (config) => {
    config.interceptors.push(...interceptors)
  }
}

export function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption {
  return (config) => {
    config.queryParamsSerializer = serializer
  }
}

export function withHTTPHandle(fetchImpl: typeof fetch): ClientOption {
  return (config) => {
    config.http.fetch = fetchImpl
  }
}

export function withSSEHandle(fetchImpl: typeof fetch): ClientOption {
  return (config) => {
    config.sse.fetch = fetchImpl
  }
}

export function withWebSocketHandle(WebSocketImpl: typeof WebSocket): ClientOption {
  return (config) => {
    config.webSocket.WebSocket = WebSocketImpl
  }
}

export function withWebSocketBeforeConnect(beforeConnect: WebSocketBeforeConnect): ClientOption {
  return (config) => {
    config.webSocket.beforeConnect = beforeConnect
  }
}

/**
 * Configure WebSocket subprotocols for the connection handshake.
 *
 * `protocols` are passed as the second argument to the `WebSocket` constructor
 * and participate in the RFC 6455 subprotocol negotiation. They are only
 * meaningful when the server requires a specific protocol (for example,
 * `['json']` or `['v1']` to select a message encoding version).
 */
export function withWebSocketProtocols(protocols: readonly string[]): ClientOption {
  return (config) => {
    config.webSocket.protocols = [...protocols]
  }
}

export function withWebSocketHeartbeat(options: WebSocketHeartbeatOptions): ClientOption {
  return (config) => {
    config.webSocket.heartbeat = { ...options }
  }
}

export function withWebSocketQueue(options: WebSocketQueueOptions): ClientOption {
  return (config) => {
    config.webSocket.queue = { ...options }
  }
}

export function withWebSocketReconnect(options: WebSocketReconnectOptions): ClientOption {
  return (config) => {
    config.webSocket.reconnect = { ...options }
  }
}

export function withSSEOptions(options: ClientSSEOptions): ClientOption {
  return (config) => {
    if (options.fetch !== undefined) {
      config.sse.fetch = options.fetch
    }
    if (options.onInvalidEvent !== undefined) {
      config.sse.onInvalidEvent = options.onInvalidEvent
    }
    if (options.reconnect !== undefined) {
      config.sse.reconnect = { ...options.reconnect }
    }
    if (options.queue !== undefined) {
      config.sse.queue = { ...options.queue }
    }
    if (options.maxBufferSize !== undefined) {
      config.sse.maxBufferSize = options.maxBufferSize
    }
  }
}

export function withSSEOnInvalidEvent(handler: SSEInvalidEventHandler): ClientOption {
  return (config) => {
    config.sse.onInvalidEvent = handler
  }
}

export function withSSEReconnect(options: SSEReconnectOptions): ClientOption {
  return (config) => {
    config.sse.reconnect = { ...options }
  }
}

export function withSSEQueue(options: SSEQueueOptions): ClientOption {
  return (config) => {
    config.sse.queue = { ...options }
  }
}

export function withWebSocketOptions(options: ClientWebSocketOptions): ClientOption {
  return (config) => {
    if (options.WebSocket !== undefined) {
      config.webSocket.WebSocket = options.WebSocket
    }
    if (options.beforeConnect !== undefined) {
      config.webSocket.beforeConnect = options.beforeConnect
    }
    if (options.heartbeat !== undefined) {
      config.webSocket.heartbeat = { ...options.heartbeat }
    }
    if (options.protocols !== undefined) {
      config.webSocket.protocols = [...options.protocols]
    }
    if (options.queue !== undefined) {
      config.webSocket.queue = { ...options.queue }
    }
    if (options.reconnect !== undefined) {
      config.webSocket.reconnect = { ...options.reconnect }
    }
  }
}

export function withXSRF(options: ClientXSRFOptions = {}): ClientOption {
  return (config) => {
    config.xsrf = {
      cookieName: options.cookieName ?? 'XSRF-TOKEN',
      headerName: options.headerName ?? 'X-XSRF-TOKEN',
      tokenProvider: options.tokenProvider,
    }
  }
}

export function withCredentials(value: boolean): ClientOption {
  return (config) => {
    config.withCredentials = value
  }
}
