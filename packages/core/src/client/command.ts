import type { RequestOutputShape } from '../http/request'
import type { HttpCommand, HttpExecuteOptions } from '../http/http'
import type { EventSchemas, EventStreamCommand, EventStreamExecuteOptions } from '../sse/sse'
import type { AnyStruct } from '../struct'
import type {
  SocketSchemas,
  WebSocketCommand,
  WebSocketExecuteOptions,
  WebSocketIncomingData,
  WebSocketOutgoingData,
} from '../web_socket/web_socket'

export const COMMAND_TYPE = Symbol.for('defjs.command.type')
export const HTTP_COMMAND = Symbol.for('defjs.command.http')
export const EVENT_STREAM_COMMAND = Symbol.for('defjs.command.event-stream')
export const WEB_SOCKET_COMMAND = Symbol.for('defjs.command.web-socket')

export type CommandType = typeof HTTP_COMMAND | typeof EVENT_STREAM_COMMAND | typeof WEB_SOCKET_COMMAND

export interface BaseCommand<TCommandType extends CommandType> {
  readonly [COMMAND_TYPE]: TCommandType
}

export type Command =
  | HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined>
  | EventStreamCommand<AnyStruct | undefined, EventSchemas>
  | WebSocketCommand<AnyStruct | undefined, SocketSchemas, SocketSchemas | undefined>

export type HttpCommandEntry = [
  command: HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined>,
  options?: HttpExecuteOptions,
]
export type EventStreamCommandEntry = [
  command: EventStreamCommand<AnyStruct | undefined, EventSchemas>,
  options?: EventStreamExecuteOptions,
]
export type WebSocketCommandEntry = [
  command: WebSocketCommand<AnyStruct | undefined, SocketSchemas, SocketSchemas | undefined>,
  options?: WebSocketExecuteOptions<WebSocketIncomingData<SocketSchemas>, WebSocketOutgoingData<SocketSchemas | undefined>>,
]
export type UnknownCommandEntry = [command: Command, options?: unknown]


function commandTypeOf(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !(COMMAND_TYPE in value)) {
    return undefined
  }

  return value[COMMAND_TYPE]
}

export function isHttpCommand(value: unknown): value is HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined> {
  return commandTypeOf(value) === HTTP_COMMAND
}

export function isEventStreamCommand(value: unknown): value is EventStreamCommand<AnyStruct | undefined, EventSchemas> {
  return commandTypeOf(value) === EVENT_STREAM_COMMAND
}

export function isWebSocketCommand(
  value: unknown,
): value is WebSocketCommand<AnyStruct | undefined, SocketSchemas, SocketSchemas | undefined> {
  return commandTypeOf(value) === WEB_SOCKET_COMMAND
}

export function isHttpCommandEntry(entry: UnknownCommandEntry): entry is HttpCommandEntry {
  return isHttpCommand(entry[0])
}

export function isEventStreamCommandEntry(entry: UnknownCommandEntry): entry is EventStreamCommandEntry {
  return isEventStreamCommand(entry[0])
}

export function isWebSocketCommandEntry(entry: UnknownCommandEntry): entry is WebSocketCommandEntry {
  return isWebSocketCommand(entry[0])
}
