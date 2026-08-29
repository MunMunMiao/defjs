import type { RequestOutputShape } from '../http/request'
import type { HttpCommand } from '../http/http'
import type { EventStructs, EventStreamCommand } from '../sse/sse'
import type { AnyStruct } from '../struct'
import type { SocketStructs, WebSocketCommand } from '../web_socket/web_socket'

export const COMMAND_TYPE: unique symbol = Symbol.for('defjs.command.type')
export const HTTP_COMMAND: unique symbol = Symbol.for('defjs.command.http')
export const EVENT_STREAM_COMMAND: unique symbol = Symbol.for('defjs.command.event-stream')
export const WEB_SOCKET_COMMAND: unique symbol = Symbol.for('defjs.command.web-socket')

export type CommandType = typeof HTTP_COMMAND | typeof EVENT_STREAM_COMMAND | typeof WEB_SOCKET_COMMAND

export interface BaseCommand<TCommandType extends CommandType> {
  readonly [COMMAND_TYPE]: TCommandType
}

export type Command =
  | HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined>
  | EventStreamCommand<AnyStruct | undefined, EventStructs>
  | WebSocketCommand<AnyStruct | undefined, SocketStructs, SocketStructs | undefined>

function commandTypeOf(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !(COMMAND_TYPE in value)) {
    return undefined
  }

  return value[COMMAND_TYPE]
}

export function isHttpCommand(value: unknown): value is HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined> {
  return commandTypeOf(value) === HTTP_COMMAND
}

export function isEventStreamCommand(value: unknown): value is EventStreamCommand<AnyStruct | undefined, EventStructs> {
  return commandTypeOf(value) === EVENT_STREAM_COMMAND
}

export function isWebSocketCommand(
  value: unknown,
): value is WebSocketCommand<AnyStruct | undefined, SocketStructs, SocketStructs | undefined> {
  return commandTypeOf(value) === WEB_SOCKET_COMMAND
}
