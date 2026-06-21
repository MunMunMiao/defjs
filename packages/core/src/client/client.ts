import type { Command } from './command'
import { isEventStreamCommandEntry, isHttpCommandEntry, isWebSocketCommandEntry } from './command'
import type { ClientConfig } from './config'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import type { ClientOption } from './option'
import type { HttpAwaitResult, HttpCommand, HttpExecuteOptions, RequestErrorData, RequestSuccessData } from '../http/http'
import { executeHttpCommand } from '../http/http'
import type { RequestOutputShape } from '../http/request'
import type { EventStructs, EventStreamCommand, EventStreamData, EventStreamExecuteOptions, StreamAwaitResult } from '../sse/sse'
import { executeEventStreamCommand } from '../sse/sse'
import type { AnyStruct } from '../struct'
import type {
  SocketAwaitResult,
  SocketStructs,
  WebSocketCommand,
  WebSocketExecuteOptions,
  WebSocketIncomingData,
  WebSocketOutgoingData,
} from '../web_socket/web_socket'
import { executeWebSocketCommand } from '../web_socket/web_socket'

export const CLIENT = Symbol('Client')

export type Client = {
  readonly [CLIENT]: ClientConfig

  execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
    command: HttpCommand<TInput, TOutput>,
    options?: HttpExecuteOptions,
  ): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>>

  execute<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
    command: EventStreamCommand<TInput, TEvents>,
    options?: EventStreamExecuteOptions,
  ): Promise<StreamAwaitResult<EventStreamData<TEvents>>>

  execute<TInput extends AnyStruct | undefined, TIncoming extends SocketStructs, TOutgoing extends SocketStructs | undefined>(
    command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
    options?: WebSocketExecuteOptions<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  ): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>

  execute(command: Command, options?: unknown): Promise<unknown>
}

export function isClient(value: unknown): value is Client {
  return typeof value === 'object' && value !== null && CLIENT in value
}

export function getClientConfig(client: Client): ClientConfig {
  if (!isClient(client)) {
    throw new TypeError('Value is not a valid Client instance')
  }

  return client[CLIENT]
}

export function createClient(...options: ClientOption[]): Client {
  const conf: ClientConfig = {
    endpoint: '',
    http: { ...DEFAULT_HTTP_OPTIONS },
    interceptors: [],
    queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
    sse: { ...DEFAULT_SSE_OPTIONS },
    webSocket: {
      handle: globalThis.WebSocket,
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

  function execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
    command: HttpCommand<TInput, TOutput>,
    options?: HttpExecuteOptions,
  ): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>>
  function execute<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
    command: EventStreamCommand<TInput, TEvents>,
    options?: EventStreamExecuteOptions,
  ): Promise<StreamAwaitResult<EventStreamData<TEvents>>>
  function execute<TInput extends AnyStruct | undefined, TIncoming extends SocketStructs, TOutgoing extends SocketStructs | undefined>(
    command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
    options?: WebSocketExecuteOptions<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  ): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>
  function execute(command: Command, options?: unknown): Promise<unknown>
  function execute(...entry: [command: Command, options?: unknown]): Promise<unknown> {
    if (isHttpCommandEntry(entry)) {
      return executeHttpCommand(conf, entry[0], entry[1])
    }

    if (isEventStreamCommandEntry(entry)) {
      return executeEventStreamCommand(conf, entry[0], entry[1])
    }

    if (isWebSocketCommandEntry(entry)) {
      return executeWebSocketCommand(conf, entry[0], entry[1])
    }

    return Promise.reject(new Error('Unsupported command'))
  }

  return {
    [CLIENT]: conf,
    execute,
  }
}
