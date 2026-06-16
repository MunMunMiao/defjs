import type { ClientConfig } from './config'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import type { Command } from './command'
import type { ClientOption } from './option'
import type { Client } from './resolve'
import { CLIENT } from './resolve'
import type { AnyStruct } from '../struct'
import type { RequestOutputShape } from '../http/request'
import type { HttpAwaitResult, HttpCommand, RequestErrorData, RequestSuccessData } from '../http/http'
import { executeHttpCommand } from '../http/http'
import type { EventSchemas, EventStreamCommand, EventStreamData, StreamAwaitResult } from '../sse/sse'
import { executeEventStreamCommand } from '../sse/sse'
import type {
  SocketAwaitResult,
  SocketSchemas,
  WebSocketCommand,
  WebSocketIncomingData,
  WebSocketOutgoingData,
} from '../web_socket/web_socket'
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

export function execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
  command: HttpCommand<TInput, TOutput>,
  options: { client: Client; signal?: AbortSignal },
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>>
export function execute<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  command: EventStreamCommand<TInput, TEvents>,
  options: { client: Client; signal?: AbortSignal },
): Promise<StreamAwaitResult<EventStreamData<TEvents>>>
export function execute<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(
  command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
  options: { client: Client; signal?: AbortSignal },
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>
export function execute(command: Command, options: { client: Client; signal?: AbortSignal }): Promise<unknown> {
  return options.client.execute(command, options)
}
