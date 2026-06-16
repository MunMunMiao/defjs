import type { ClientConfig } from './config'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import type { Command } from './command'
import { getGlobalClient } from './global'
import type { ClientOption } from './option'
import type { Client } from './resolve'
import { CLIENT, getClientConfig } from './resolve'
import { executeHttpCommand } from '../http/http'
import type { HttpCommand } from '../http/http'
import { executeEventStreamCommand } from '../sse/sse'
import type { EventStreamCommand } from '../sse/sse'

import { executeWebSocketCommand } from '../web_socket/web_socket'
import type { WebSocketCommand } from '../web_socket/web_socket'

function createClientFromConfig(config: ClientConfig): Client {
  const client: Client = {
    [CLIENT]: config,
    execute(command: Command, options?: { signal?: AbortSignal }): Promise<unknown> {
      switch (command.kind) {
        case 'http':
          return executeHttpCommand(config, command as HttpCommand<any, any>, options)
        case 'event-stream':
          return executeEventStreamCommand(config, command as EventStreamCommand<any, any>, options) as Promise<unknown>
        case 'web-socket':
          return executeWebSocketCommand(config, command as WebSocketCommand<any, any, any>, options) as Promise<unknown>
      }
      return Promise.reject(new Error(`Unsupported command kind: ${command.kind}`))
    },
  }

  return client
}

export function createClient(...options: ClientOption[]): Client {
  const conf: ClientConfig = {
    endpoint: '',
    http: { ...DEFAULT_HTTP_OPTIONS },
    interceptors: [],
    queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
    sse: { ...DEFAULT_SSE_OPTIONS },
    webSocket: {
      WebSocket: globalThis.WebSocket,
      beforeConnect: undefined,
      heartbeat: undefined,
      protocols: undefined,
      queue: undefined,
      reconnect: undefined,
    },
    xsrf: undefined,
  }

  for (const option of options) {
    option(conf)
  }

  return createClientFromConfig(conf)
}

export function cloneClient(client: Client, ...options: ClientOption[]): Client {
  const prev = getClientConfig(client)

  const conf: ClientConfig = {
    endpoint: prev.endpoint,
    http: { ...prev.http },
    interceptors: [...prev.interceptors],
    queryParamsSerializer: prev.queryParamsSerializer,
    sse: {
      ...prev.sse,
      reconnect: prev.sse.reconnect ? { ...prev.sse.reconnect } : undefined,
      queue: prev.sse.queue ? { ...prev.sse.queue } : undefined,
    },
    webSocket: {
      ...prev.webSocket,
    },
    xsrf: prev.xsrf
      ? {
          ...prev.xsrf,
        }
      : undefined,
    withCredentials: prev.withCredentials,
  }

  if (prev.webSocket.protocols) {
    conf.webSocket.protocols = [...prev.webSocket.protocols]
  }
  if (prev.webSocket.heartbeat) {
    conf.webSocket.heartbeat = { ...prev.webSocket.heartbeat }
  }
  if (prev.webSocket.reconnect) {
    conf.webSocket.reconnect = { ...prev.webSocket.reconnect }
  }
  if (prev.webSocket.queue) {
    conf.webSocket.queue = { ...prev.webSocket.queue }
  }

  for (const option of options) {
    option(conf)
  }

  return createClientFromConfig(conf)
}

export function resolveClientConfig(client?: Client): ClientConfig {
  return getClientConfig(client ?? getGlobalClient())
}
