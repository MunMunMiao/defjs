import { expectTypeOf } from 'vitest'
import type { HTTP_COMMAND } from '../client/command'
import { COMMAND_TYPE } from '../client/command'
import { createClient } from '../client'
import type { HttpResponse } from './index'
import type { HttpAwaitResult, HttpExecuteOptions } from './http'
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

const structuralExecuteOptions: { signal?: AbortSignal; timeout?: number } = {}
const acceptedExecuteOptions: HttpExecuteOptions = structuralExecuteOptions
void acceptedExecuteOptions

async function assertStructuralExecuteOptions(): Promise<void> {
  const [error, result] = await createClient().execute(command, structuralExecuteOptions)
  void error
  void result
}

void assertStructuralExecuteOptions

// @ts-expect-error execute rejects conflicting cancellation options instead of falling through to a catch-all overload.
createClient().execute(command, { abort: new AbortController().signal, timeout: 1 })

// Optional input builder should allow no argument
const useList = defineRequest({ method: 'GET', path: '/users', output: { 200: struct.object({ items: struct.object({}) }) } })
expectTypeOf(useList).toBeCallableWith()

const useInferredArrayOutput = defineRequest({
  method: 'GET',
  path: '/array-output',
  output: [
    { body: struct.object({ ok: struct.literal(true) }), status: 200 },
    { body: struct.object({ missing: struct.string() }), status: 404 },
    { body: struct.object({ conflict: struct.string() }), status: [409, 422] },
  ],
})

async function assertInferredArrayOutput(): Promise<void> {
  const [requestError, result] = await createClient().execute(useInferredArrayOutput())

  if (!requestError) {
    expectTypeOf(result).toEqualTypeOf<{ ok: true }>()
    return
  }

  expectTypeOf(result).toEqualTypeOf<undefined>()
  if (requestError.kind !== 'http') {
    // @ts-expect-error transport and definition errors do not carry response data.
    void requestError.data
    return
  }

  // @ts-expect-error only declared non-2xx statuses are represented.
  const impossibleStatus: 500 = requestError.status
  void impossibleStatus

  if (requestError.status === 404) {
    expectTypeOf(requestError.data).toEqualTypeOf<{ missing: string }>()
  } else {
    expectTypeOf(requestError.status).toEqualTypeOf<409 | 422>()
    expectTypeOf(requestError.data).toEqualTypeOf<{ conflict: string }>()
  }
}

void assertInferredArrayOutput

const useMappedOutput = defineRequest({
  method: 'GET',
  path: '/mapped-output',
  output: {
    200: struct.object({ ok: struct.literal(true) }),
    400: struct.object({ field: struct.string() }),
    409: struct.object({ conflict: struct.string() }),
  },
})

async function assertMappedOutput(): Promise<void> {
  const [requestError, result] = await createClient().execute(useMappedOutput())

  if (!requestError) {
    expectTypeOf(result).toEqualTypeOf<{ ok: true }>()
  } else if (requestError.kind === 'http') {
    if (requestError.status === 400) {
      expectTypeOf(requestError.data).toEqualTypeOf<{ field: string }>()
    } else {
      expectTypeOf(requestError.status).toEqualTypeOf<409>()
      expectTypeOf(requestError.data).toEqualTypeOf<{ conflict: string }>()
    }
  }
}

void assertMappedOutput

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

const useOptionalRequestSections = defineRequest({
  input: struct.request({
    headers: struct.object({ traceId: struct.string().optional() }),
    path: struct.object({ locale: struct.string().optional() }),
    query: struct.object({ page: struct.number().optional() }),
  }),
  method: 'GET',
  path: '/optional-sections',
})
useOptionalRequestSections({})
useOptionalRequestSections({ query: { page: 1 } })
// @ts-expect-error the request root remains required even when every declared section is optional.
useOptionalRequestSections()

const useMixedRequestSection = defineRequest({
  input: struct.request({ query: struct.object({ page: struct.number().optional(), q: struct.string() }) }),
  method: 'GET',
  path: '/mixed-section',
})
useMixedRequestSection({ query: { q: 'defjs' } })
// @ts-expect-error a section with any required field cannot be omitted.
useMixedRequestSection({})

const useOptionalBodyFields = defineRequest({
  input: struct.request({ body: struct.json(struct.object({ note: struct.string().optional() })) }),
  method: 'POST',
  path: '/body',
})
useOptionalBodyFields({ body: {} })
// @ts-expect-error all-optional body fields do not make the body section optional.
useOptionalBodyFields({})

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
