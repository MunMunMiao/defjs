import { expectTypeOf } from 'vitest'
import { COMMAND_TYPE, WEB_SOCKET_COMMAND } from '../client/command'
import { defineWebSocket } from './web_socket'
import { struct } from '../struct'

const useChat = defineWebSocket({
  path: '/ws',
  incoming: { message: struct.object({ text: struct.string() }) },
})

const command = useChat()
expectTypeOf(command[COMMAND_TYPE]).toEqualTypeOf<typeof WEB_SOCKET_COMMAND>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()

export type Cases = true
