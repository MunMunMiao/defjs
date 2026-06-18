import { expectTypeOf } from 'vitest'
import type { EVENT_STREAM_COMMAND } from '../client/command'
import { COMMAND_TYPE } from '../client/command'
import { defineEventStream } from './sse'
import { struct } from '../struct'

const useEvents = defineEventStream({
  path: '/events',
  events: { message: struct.object({ text: struct.string() }) },
})

const command = useEvents()
expectTypeOf(command[COMMAND_TYPE]).toEqualTypeOf<typeof EVENT_STREAM_COMMAND>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()

export type Cases = true
