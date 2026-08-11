import type { Command } from './command'
import { isEventStreamCommand, isHttpCommand, isWebSocketCommand } from './command'
import type { ClientConfig } from './config'
import { applyClientOptions, createClientConfig } from './config'
import type { ClientOption } from './option'
import type { HttpCommand, HttpExecuteOptions } from '../http/http'
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
  ): ReturnType<typeof executeHttpCommand<TInput, TOutput>>

  execute<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
    command: EventStreamCommand<TInput, TEvents>,
    options?: EventStreamExecuteOptions,
  ): Promise<StreamAwaitResult<EventStreamData<TEvents>>>

  execute<TInput extends AnyStruct | undefined, TIncoming extends SocketStructs, TOutgoing extends SocketStructs | undefined>(
    command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
    options?: WebSocketExecuteOptions<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  ): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>
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
  const conf = applyClientOptions(createClientConfig(), options)

  function execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
    command: HttpCommand<TInput, TOutput>,
    options?: HttpExecuteOptions,
  ): ReturnType<typeof executeHttpCommand<TInput, TOutput>>
  function execute<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
    command: EventStreamCommand<TInput, TEvents>,
    options?: EventStreamExecuteOptions,
  ): Promise<StreamAwaitResult<EventStreamData<TEvents>>>
  function execute<TInput extends AnyStruct | undefined, TIncoming extends SocketStructs, TOutgoing extends SocketStructs | undefined>(
    command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
    options?: WebSocketExecuteOptions<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  ): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>
  function execute(command: Command, options?: unknown): Promise<unknown> {
    if (isHttpCommand(command)) {
      return executeHttpCommand(conf, command, options as HttpExecuteOptions | undefined)
    }

    if (isEventStreamCommand(command)) {
      return executeEventStreamCommand(conf, command, options as EventStreamExecuteOptions | undefined)
    }

    if (isWebSocketCommand(command)) {
      return executeWebSocketCommand(
        conf,
        command,
        options as
          | WebSocketExecuteOptions<WebSocketIncomingData<SocketStructs>, WebSocketOutgoingData<SocketStructs | undefined>>
          | undefined,
      )
    }

    return Promise.reject(new Error('Unsupported command'))
  }

  return {
    [CLIENT]: conf,
    execute,
  }
}
