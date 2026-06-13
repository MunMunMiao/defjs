import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint, withInterceptors, withXSRF } from '../client'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct, tag } from '../struct'
import type { HttpRequest } from './index'
import { defineRequest } from './index'

describe('request http runtime', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should resolve success tuple for object-style request endpoints', async () => {
    const useCreateAccount = defineRequest({
      method: 'POST',
      output: {
        200: struct.object({
          id: struct.number(),
          name: struct.string(),
        }),
      },
      path: '/account',
    })

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
          body: struct.object({
            code: struct.string(),
            message: struct.string(),
          }),
          status: [401, 403, 404] as const,
        },
      ],
      path: '/account/not-found',
    })

    const [error, result, response] = await useMissingAccount()

    expect(result).toBeUndefined()
    expect(response?.status).toBe(404)
    expect(error?.kind).toBe('http')

    if (error?.kind !== 'http') {
      throw new Error('Expected http error')
    }

    expect(error.data).toEqual({
      code: 'ACCOUNT_NOT_FOUND',
      message: 'Account not found',
    })
  })

  test('should decode response bodies with struct key aliases', async () => {
    setGlobalClient(
      createClient(
        withEndpoint('https://example.com'),
        withInterceptors(
          createHttpInterceptor(async () =>
            makeResponse({
              body: {
                user_name: 'Miao',
              },
              status: 200,
            }),
          ),
        ),
      ),
    )

    const useUser = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          name: struct.string().tag(tag.json('user_name')),
        }),
      },
      path: '/user',
    })

    const [error, result] = await useUser()

    expect(error).toBeNull()
    expect(result).toEqual({ name: 'Miao' })
  })

  test('should build params query headers and body, and only execute once per ref', async () => {
    let callCount = 0
    let capturedRequest: HttpRequest | undefined

    const client = createClient(
      withEndpoint('https://example.com/api'),
      withInterceptors(
        createHttpInterceptor(async (request) => {
          callCount += 1
          capturedRequest = request as typeof capturedRequest
          return makeResponse({
            body: {
              ok: true,
            },
            status: 200,
          })
        }),
      ),
    )

    const useInspectRequest = defineRequest({
      build: (request, input) => {
        request.setJson({
          nickname: input.body.nickname,
        })
        request.setHeaders({
          'x-token': input.headers.token,
        })
        request.setPathParams({
          id: input.path.id,
        })
        request.setQueryParams({
          include: input.query.include,
          tags: input.query.tags,
        })
      },
      input: struct.request({
        body: struct.json(
          struct.object({
            nickname: struct.string(),
          }),
        ),
        headers: struct.object({
          token: struct.string(),
        }),
        path: struct.object({
          id: struct.number(),
        }),
        query: struct.object({
          include: struct.boolean(),
          tags: struct.array(struct.string()),
        }),
      }),
      method: 'POST',
      output: {
        200: struct.object({
          ok: struct.boolean(),
        }),
      },
      path: '/inspect/:id',
    })

    const ref = useInspectRequest({
      body: { nickname: 'Miao' },
      headers: { token: 'secret' },
      path: { id: 7 },
      query: { include: true, tags: ['a', 'b'] },
    }).with({
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

  test('should expose xsrf client config on the final HttpRequest', async () => {
    const tokenProvider = () => 'xsrf-token'
    let capturedRequest: HttpRequest | undefined

    setGlobalClient(
      createClient(
        withEndpoint('https://example.com/api'),
        withXSRF({
          cookieName: 'CUSTOM-XSRF-TOKEN',
          headerName: 'X-CUSTOM-XSRF-TOKEN',
          tokenProvider,
        }),
        withInterceptors(
          createHttpInterceptor(async (request) => {
            capturedRequest = request as typeof capturedRequest
            return makeResponse({
              body: {
                ok: true,
              },
              status: 200,
            })
          }),
        ),
      ),
    )

    const useInspectXsrf = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          ok: struct.boolean(),
        }),
      },
      path: '/xsrf',
    })

    const [error, result] = await useInspectXsrf()

    expect(error).toBeNull()
    expect(result).toEqual({ ok: true })
    expect(capturedRequest?.xsrf).toEqual({
      cookieName: 'CUSTOM-XSRF-TOKEN',
      headerName: 'X-CUSTOM-XSRF-TOKEN',
      tokenProvider,
    })
  })

  test('should return definition error when build is provided without input schema', async () => {
    const useRawInput = defineRequest({
      build: () => {
        return undefined
      },
      method: 'GET',
      path: '/raw-input',
    } as never)

    const [error, result, response] = await useRawInput()

    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
  })

  test('should ignore response body when output is omitted', async () => {
    setGlobalClient(
      createClient(
        withEndpoint('https://example.com'),
        withInterceptors(
          createHttpInterceptor(async () =>
            makeResponse({
              body: {
                ignored: true,
              },
              status: 200,
            }),
          ),
        ),
      ),
    )

    const useIgnoredOutput = defineRequest({
      method: 'GET',
      path: '/ignored-output',
    })

    const [error, result, response] = await useIgnoredOutput()

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.status).toBe(200)
    expect(response?.body).toBeNull()
  })

  test('should return http error when output is omitted and response is not ok', async () => {
    setGlobalClient(
      createClient(
        withEndpoint('https://example.com'),
        withInterceptors(
          createHttpInterceptor(async () =>
            makeResponse({
              body: { error: 'fail' },
              status: 500,
              statusText: 'Internal Server Error',
            }),
          ),
        ),
      ),
    )

    const useNoOutput = defineRequest({
      method: 'GET',
      path: '/fail',
    })

    const [error, result, response] = await useNoOutput()

    expect(error?.kind).toBe('http')
    expect(error?.code).toBe('HTTP_STATUS')
    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(response?.body).toBeNull()
  })
})
