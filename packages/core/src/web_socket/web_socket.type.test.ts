import { expectTypeOf } from 'vitest'
import type { WEB_SOCKET_COMMAND } from '../client/command'
import { COMMAND_TYPE } from '../client/command'
import { defineWebSocket, type WebSocketExecuteOptions } from './web_socket'
import { struct } from '../struct'

const useChat = defineWebSocket({
  path: '/ws',
  maxIncomingQueueSize: 16,
  incoming: { message: struct.object({ text: struct.string() }) },
})

// @ts-expect-error maxIncomingQueueSize is required for every endpoint owner
defineWebSocket({ path: '/ws', incoming: { message: struct.string() } })

const command = useChat()
expectTypeOf(command[COMMAND_TYPE]).toEqualTypeOf<typeof WEB_SOCKET_COMMAND>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()
expectTypeOf(command.endpoint.maxIncomingQueueSize).toEqualTypeOf<number>()

const options: WebSocketExecuteOptions = {
  beforeConnect({ attempt, signal }) {
    expectTypeOf(attempt).toEqualTypeOf<number>()
    expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
  },
}
void options

const removedQueueOption: WebSocketExecuteOptions = {
  // @ts-expect-error execute-level queue policy was removed
  queue: { maxSize: 1 },
}
void removedQueueOption

export type Cases = true
