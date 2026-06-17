import type { Command } from './command'
import type { ClientConfig } from './config'
import type { AnyStruct } from '../struct'
import type { RequestOutputShape } from '../http/request'
import type { HttpAwaitResult, HttpCommand, HttpExecuteOptions, RequestErrorData, RequestSuccessData } from '../http/http'
import type { EventSchemas, EventStreamCommand, EventStreamData, EventStreamExecuteOptions, StreamAwaitResult } from '../sse/sse'
import type {
  SocketAwaitResult,
  SocketSchemas,
  WebSocketCommand,
  WebSocketExecuteOptions,
  WebSocketIncomingData,
  WebSocketOutgoingData,
} from '../web_socket/web_socket'

export const CLIENT = Symbol('Client')

export type Client = {
  readonly [CLIENT]: ClientConfig

  execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
    command: HttpCommand<TInput, TOutput>,
    options?: HttpExecuteOptions,
  ): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>>

  execute<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
    command: EventStreamCommand<TInput, TEvents>,
    options?: EventStreamExecuteOptions,
  ): Promise<StreamAwaitResult<EventStreamData<TEvents>>>

  execute<TInput extends AnyStruct | undefined, TIncoming extends SocketSchemas, TOutgoing extends SocketSchemas | undefined>(
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
