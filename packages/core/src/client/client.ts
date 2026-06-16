import type { ClientConfig } from './config'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import type { Command } from './command'
import type { ClientOption } from './option'
import type { Client } from './resolve'
import { CLIENT } from './resolve'
import type { HttpCommand } from '../http/http'
import { executeHttpCommand } from '../http/http'
import type { EventStreamCommand } from '../sse/sse'
import { executeEventStreamCommand } from '../sse/sse'
import type { WebSocketCommand } from '../web_socket/web_socket'
import { executeWebSocketCommand } from '../web_socket/web_socket'

function dispatchCommand(
  config: ClientConfig,
  command: Command,
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  switch (command.kind) {
    case 'http':
      return executeHttpCommand(config, command as HttpCommand<any, any>, options)
    case 'event-stream':
      return executeEventStreamCommand(config, command as EventStreamCommand<any, any>, options) as Promise<unknown>
    case 'web-socket':
      return executeWebSocketCommand(config, command as WebSocketCommand<any, any, any>, options) as Promise<unknown>
  }
  return Promise.reject(new Error(`Unsupported command kind: ${command.kind}`))
}

function createClientFromConfig(config: ClientConfig): Client {
  return {
    [CLIENT]: config,
    execute: ((command: Command, options?: { signal?: AbortSignal }) =>
      dispatchCommand(config, command, options)) as Client['execute'],
  }
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
