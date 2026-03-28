import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from './client'
import { defineRequest } from './index'
import { schema } from './schema'

describe('request http runtime errors', () => {
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

  test('should resolve non-2xx responses as http errors with typed data', async () => {
    const useMissingAccount = defineRequest({
      method: 'GET',
      output: {
        404: schema.object({
          code: schema.string(),
          message: schema.string(),
        }),
      },
      path: '/account/not-found',
    }).use

    const [error, result, response] = await useMissingAccount()

    expect(result).toBeUndefined()
    expect(response?.ok).toBe(false)
    expect(response?.status).toBe(404)
    expect(error?.kind).toBe('http')

    if (!error || error.kind !== 'http') {
      throw new Error('Expected http error')
    }

    expect(error.status).toBe(404)
    expect(error.data).toEqual({
      code: 'ACCOUNT_NOT_FOUND',
      message: 'Account not found',
    })
  })

  test('should return request validation failures as definition errors', async () => {
    const useValidatedRequest = defineRequest({
      input: schema.object({
        id: schema.number(),
      }),
      method: 'GET',
      output: {
        200: schema.null(),
      },
      path: '/null',
    }).use

    const [error, result, response] = await useValidatedRequest({ id: 'oops' } as never)

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')

    if (!error || error.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return response validation failures as definition errors', async () => {
    const useBadResponse = defineRequest({
      method: 'GET',
      output: {
        200: schema.object({
          name: schema.string().refine(value => value['endsWith']('!'), 'name must end with !'),
        }),
      },
      path: '/text',
    }).use

    const [error, result, response] = await useBadResponse()

    expect(result).toBeUndefined()
    expect(response?.status).toBe(200)
    expect(error?.kind).toBe('definition')

    if (!error || error.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('RESPONSE_VALIDATION_FAILED')
  })

  test('should return undeclared status failures as definition errors', async () => {
    const useUndeclaredStatus = defineRequest({
      method: 'GET',
      output: {
        200: schema.null(),
      },
      path: '/500',
    }).use

    const [error, result, response] = await useUndeclaredStatus()

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('definition')

    if (!error || error.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('UNDECLARED_STATUS')
  })

  test('should support timeout in second-stage config', async () => {
    const useDelay = defineRequest({
      build: (request, input) => {
        request.queryParams({
          ms: input.ms,
        })
      },
      input: schema.object({
        ms: schema.number(),
      }),
      method: 'GET',
      output: {
        200: schema.null(),
      },
      path: '/delay',
    }).use

    const [error, result, response] = await useDelay({ ms: 100 })({
      timeout: 10,
    })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (!error || error.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('TIMEOUT')
  })
})
