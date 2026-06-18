import { expectTypeOf } from 'vitest'
import { COMMAND_TYPE, HTTP_COMMAND } from '../client/command'
import { defineRequest } from './http'
import { struct } from '../struct'

const useGetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({ id: struct.number() }),
  output: { 200: struct.object({ name: struct.string() }) },
})

const command = useGetUser({ id: 1 })
expectTypeOf(command[COMMAND_TYPE]).toEqualTypeOf<typeof HTTP_COMMAND>()

// Optional input builder should allow no argument
const useList = defineRequest({ method: 'GET', path: '/users', output: { 200: struct.object({ items: struct.object({}) }) } })
expectTypeOf(useList).toBeCallableWith()

export type Cases = true
