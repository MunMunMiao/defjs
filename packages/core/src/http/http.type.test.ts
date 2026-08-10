import { expectTypeOf } from 'vitest'
import type { HTTP_COMMAND } from '../client/command'
import { COMMAND_TYPE } from '../client/command'
import type { HttpResponse } from './public_api'
import type { HttpAwaitResult } from './http'
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

// @ts-expect-error responseType requires an output declaration.
defineRequest({ method: 'GET', path: '/discarded', responseType: 'json' })

defineRequest({ method: 'GET', output: { 200: struct.string() }, path: '/json', responseType: 'json' })
defineRequest({ method: 'GET', output: { 200: struct.string() }, path: '/text', responseType: 'text' })
defineRequest({ method: 'GET', output: { 200: struct.blob() }, path: '/blob', responseType: 'blob' })
defineRequest({ method: 'GET', output: { 200: struct.arrayBuffer() }, path: '/bytes', responseType: 'arraybuffer' })

const useEmptyObject = defineRequest({ method: 'POST', path: '/empty', input: struct.object({}) })
// @ts-expect-error a required root Struct still requires an input argument even when {} is a valid value.
useEmptyObject()
useEmptyObject({})

const useOptionalFields = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ query: struct.string().optional() }),
})
// @ts-expect-error optional fields do not make the root object optional.
useOptionalFields()
useOptionalFields({})

const useOptionalRoot = defineRequest({ method: 'POST', path: '/optional', input: struct.object({}).optional() })
useOptionalRoot()

const useUnionInput = defineRequest({ method: 'POST', path: '/union', input: struct.or(struct.string(), struct.number()) })
// @ts-expect-error a required union input cannot be omitted.
useUnionInput()
useUnionInput('value')

declare const result: HttpAwaitResult<{ name: string }, { code: string }>
const [error, data, response] = result

if (error) {
  expectTypeOf(data).toEqualTypeOf<undefined>()
  expectTypeOf(response).toEqualTypeOf<HttpResponse<unknown> | undefined>()
} else {
  expectTypeOf(data).toEqualTypeOf<{ name: string }>()
  expectTypeOf(response).toEqualTypeOf<HttpResponse<{ name: string }>>()
  expectTypeOf(response.ok).toEqualTypeOf<boolean>()
}

export type Cases = true
