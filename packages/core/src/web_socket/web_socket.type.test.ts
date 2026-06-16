import { expectTypeOf } from 'vitest'
import { defineWebSocket } from './web_socket'
import { struct } from '../struct'

const useChat = defineWebSocket({
  path: '/ws',
  incoming: { message: struct.object({ text: struct.string() }) },
})

const command = useChat()
expectTypeOf(command.kind).toEqualTypeOf<'web-socket'>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()
