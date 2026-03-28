import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from './client'
import type { HttpRequest } from './http'
import { defineRequest } from './index'
import { makeResponse } from './response'
import { schema } from './schema'

describe('request http runtime', () => {
  beforeEach(() => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
      }),
    )
  })

  afterEach(() => {
    restGlobalClient()
  })

  test('should resolve success tuple for object-style request endpoints', async () => {
    const useCreateAccount = defineRequest({
      method: 'POST',
      output: {
        200: schema.object({
          id: schema.number(),
          name: schema.string(),
        }),
      },
      path: '/account',
    }).use

    const [error, result, response] = await useCreateAccount()

    expect(error).toBeNull()
    expect(result).toEqual({ id: 1, name: 'Jack' })
    expect(response?.ok).toBe(true)
    expect(response?.status).toBe(200)
  })

  test('should support grouped status output definitions', async () => {
    const useMissingAccount = defineRequest({
      method: 'GET',
      output: [
        {
          body: schema.object({
            code: schema.string(),
            message: schema.string(),
          }),
          status: [401, 403, 404] as const,
        },
      ],
      path: '/account/not-found',
    }).use

    const [error, result, response] = await useMissingAccount()

    expect(result).toBeUndefined()
    expect(response?.status).toBe(404)
    expect(error?.kind).toBe('http')

    if (!error || error.kind !== 'http') {
      throw new Error('Expected http error')
    }

    expect(error.data).toEqual({
      code: 'ACCOUNT_NOT_FOUND',
      message: 'Account not found',
    })
  })

  test('should build params query headers and body, and only execute once per ref', async () => {
    let callCount = 0
    let capturedRequest: HttpRequest | undefined

    const client = createClient({
      endpoint: 'https://example.com/api',
      http: {
        handler: async request => {
          callCount += 1
          capturedRequest = request as typeof capturedRequest
          return makeResponse({
            body: {
              ok: true,
            },
            status: 200,
          })
        },
      },
    })

    const useInspectRequest = defineRequest({
      build: (request, input) => {
        request.json({
          nickname: input.nickname,
        })
        request.headers({
          'x-token': input.token,
        })
        request.pathParams({
          id: input.id,
        })
        request.queryParams({
          include: input.include,
          tags: input.tags,
        })
      },
      input: schema.object({
        id: schema.number(),
        include: schema.boolean(),
        nickname: schema.string(),
        tags: schema.array(schema.string()),
        token: schema.string(),
      }),
      method: 'POST',
      output: {
        200: schema.object({
          ok: schema.boolean(),
        }),
      },
      path: '/inspect/:id',
    }).use

    const ref = useInspectRequest({
      id: 7,
      include: true,
      nickname: 'Miao',
      tags: ['a', 'b'],
      token: 'secret',
    })({
      client,
    })

    const [[firstError, firstResult], [secondError, secondResult]] = await Promise.all([ref, ref])

    expect(firstError).toBeNull()
    expect(secondError).toBeNull()
    expect(firstResult).toEqual({ ok: true })
    expect(secondResult).toEqual({ ok: true })
    expect(callCount).toBe(1)
    expect(capturedRequest?.baseEndpoint).toBe('https://example.com/api')
    expect(capturedRequest?.endpoint).toBe('/inspect/7')
    expect(capturedRequest?.queryParams?.get('include')).toBe('true')
    expect(capturedRequest?.queryParams?.getAll('tags')).toEqual(['a', 'b'])
    expect(capturedRequest?.headers?.get('x-token')).toBe('secret')
    expect(capturedRequest?.body).toBe('{"nickname":"Miao"}')
  })

  test('should pass raw input to build when input schema is omitted', async () => {
    let capturedInput: unknown

    setGlobalClient(
      createClient({
        endpoint: 'https://example.com',
        http: {
          handler: async request =>
            makeResponse({
              body: {
                ok: request.queryParams?.get('value'),
              },
              status: 200,
            }),
        },
      }),
    )

    const useRawInput = defineRequest({
      build: (request, input) => {
        capturedInput = input
        request.queryParams({
          value: (input as { value: string }).value,
        })
      },
      method: 'GET',
      path: '/raw-input',
    }).use

    const rawInput = { value: 'kept-as-is' }
    const [error, result, response] = await useRawInput(rawInput)

    expect(error).toBeNull()
    expect(capturedInput).toBe(rawInput)
    expect(result).toBeUndefined()
    expect(response?.status).toBe(200)
    expect(response?.body).toBeNull()
  })

  test('should ignore response body when output is omitted', async () => {
    setGlobalClient(
      createClient({
        endpoint: 'https://example.com',
        http: {
          handler: async () =>
            makeResponse({
              body: {
                ignored: true,
              },
              status: 200,
            }),
        },
      }),
    )

    const useIgnoredOutput = defineRequest({
      method: 'GET',
      path: '/ignored-output',
    }).use

    const [error, result, response] = await useIgnoredOutput()

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.status).toBe(200)
    expect(response?.body).toBeNull()
  })
})
