import { expectTypeOf } from 'vitest'
import { defineEventStream } from './sse'
import { struct } from '../struct'

const useEvents = defineEventStream({
  path: '/events',
  events: { message: struct.object({ text: struct.string() }) },
})

const command = useEvents()
expectTypeOf(command.kind).toEqualTypeOf<'event-stream'>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()
