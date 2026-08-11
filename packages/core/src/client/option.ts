import type { Interceptor } from '../interceptor/interceptor'
import type {
  ClientConfig,
  ClientSSEOptions,
  ClientWebSocketOptions,
  HttpClientConfig,
  HttpClientOptions,
  QueryParamsSerializer,
  WebSocketHandleConstructor,
} from './config'

export type ClientOption = (config: ClientConfig) => void
export type HttpClientOption = (config: HttpClientConfig) => void

function assignDefined<TTarget extends object>(target: TTarget, source: Partial<TTarget>): void {
  for (const key in source) {
    const value = source[key]
    if (value !== undefined) {
      target[key] = value
    }
  }
}

export function withEndpoint(endpoint: string): HttpClientOption {
  return (config) => {
    config.endpoint = endpoint
  }
}

export function withInterceptors(...interceptors: Interceptor[]): HttpClientOption {
  return (config) => {
    config.interceptors.push(...interceptors)
  }
}

export function withQueryParamsSerializer(serializer: QueryParamsSerializer): HttpClientOption {
  return (config) => {
    config.queryParamsSerializer = serializer
  }
}

export function withHTTPHandle(fetchImpl: typeof fetch): HttpClientOption {
  return (config) => {
    config.http.handle = fetchImpl
  }
}

export function withSSEHandle(fetchImpl: typeof fetch): ClientOption {
  return (config) => {
    config.sse.handle = fetchImpl
  }
}

export function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption {
  return (config) => {
    config.webSocket.handle = WebSocketImpl
  }
}

export function withWebSocketBeforeConnect(beforeConnect: ClientWebSocketOptions['beforeConnect']): ClientOption {
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
    config.webSocket.protocols = protocols
  }
}

export function withWebSocketHeartbeat(options: ClientWebSocketOptions['heartbeat']): ClientOption {
  return (config) => {
    config.webSocket.heartbeat = options
  }
}

export function withWebSocketReconnect(options: ClientWebSocketOptions['reconnect']): ClientOption {
  return (config) => {
    config.webSocket.reconnect = options
  }
}

export function withSSEOptions(options: ClientSSEOptions): ClientOption {
  return (config) => assignDefined(config.sse, options)
}

export function withSSEOnInvalidEvent(handler: ClientSSEOptions['onInvalidEvent']): ClientOption {
  return (config) => {
    config.sse.onInvalidEvent = handler
  }
}

export function withSSEReconnect(options: ClientSSEOptions['reconnect']): ClientOption {
  return (config) => {
    config.sse.reconnect = options
  }
}

export function withWebSocketOptions(options: ClientWebSocketOptions): ClientOption {
  return (config) => assignDefined(config.webSocket, options)
}

export function withXSRF(options: HttpClientOptions['xsrf'] = {}): HttpClientOption {
  return (config) => {
    config.xsrf = {
      cookieName: options.cookieName ?? 'XSRF-TOKEN',
      headerName: options.headerName ?? 'X-XSRF-TOKEN',
      tokenProvider: options.tokenProvider,
    }
  }
}

export function withCredentials(value: boolean): HttpClientOption {
  return (config) => {
    config.withCredentials = value
  }
}
