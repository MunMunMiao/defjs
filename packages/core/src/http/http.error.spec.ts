import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint, withInterceptors } from '../client'
import { ERR_ABORTED } from '../error'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('request http runtime errors', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should resolve non-2xx responses as http errors with typed data', async () => {
    const useMissingAccount = defineRequest({
      method: 'GET',
      output: {
        404: struct.object({
          code: struct.string(),
          message: struct.string(),
        }),
      },
      path: '/account/not-found',
    })

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
      input: struct.object({
        id: struct.number(),
      }),
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

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
        200: struct.object({
          id: struct.string(),
        }),
      },
      path: '/json',
    })

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
        200: struct.null(),
      },
      path: '/500',
    })

    const [error, result, response] = await useUndeclaredStatus()

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('definition')

    if (!error || error.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('UNDECLARED_STATUS')
  })

  test('should return definition error when build throws', async () => {
    const useBadBuild = defineRequest({
      build: () => {
        throw new Error('build failed')
      },
      method: 'GET',
      path: '/test',
    })

    const [error, result, response] = await useBadBuild()

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')

    if (!error || error.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return transport error when interceptor chain throws', async () => {
    const throwingInterceptor = createHttpInterceptor(async () => {
      throw new Error('interceptor boom')
    })

    const client = createClient(withEndpoint('https://example.com'), withInterceptors(throwingInterceptor))

    const useIntercepted = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/intercepted',
    })

    const [error, result, response] = await useIntercepted().with({ client })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (!error || error.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('NETWORK_ERROR')
  })

  test('should return aborted error when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)

    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

    const ref = useRequest().with({ abort: controller.signal })
    const [error, result, response] = await ref

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
    expect(ref.status).toBe('aborted')
  })

  test('should reject with.abort and with.timeout before parsing HTTP input', async () => {
    const controller = new AbortController()
    const useRequest = defineRequest({
      input: struct.object({
        id: struct.string(),
      }),
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

    const ref = useRequest({ id: 1 } as never).with({ abort: controller.signal, timeout: 1 } as never)
    const [error, result, response] = await ref

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
    expect(ref.status).toBe('error')
  })

  test('should prefer HTTP cancellation config conflict over an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)
    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

    const ref = useRequest().with({ abort: controller.signal, timeout: 1 } as never)
    const [error, result, response] = await ref

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
    expect(ref.status).toBe('error')
  })

  test('should return transport error when client is invalid', async () => {
    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

    const [error, result, response] = await useRequest().with({ client: {} as never })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('NETWORK_ERROR')
  })

  test('should return ABORTED when signal is aborted with explicit undefined reason', async () => {
    const signal = { aborted: true, reason: undefined } as AbortSignal

    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

    const ref = useRequest().with({ abort: signal })
    const [error, result, response] = await ref

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
    expect(ref.status).toBe('aborted')
  })

  test('should use HTTP status message when response.error is undefined without output', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: null,
            error: undefined,
            status: 500,
            statusText: 'Server Error',
            url: 'https://example.com/test',
          }),
        ),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toContain('500')
  })

  test('should use HTTP status message when response.error is undefined with output schema', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: { code: 'ERR' },
            error: undefined,
            headers: new Headers([['content-type', 'application/json']]),
            status: 500,
            statusText: 'Server Error',
            url: 'https://example.com/test',
          }),
        ),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      output: {
        500: struct.object({ code: struct.string() }),
      },
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toContain('500')
    if (error?.kind === 'http') {
      expect(error.data).toEqual({ code: 'ERR' })
    }
  })

  test('should expose error on ref after failed request', async () => {
    const useBadRequest = defineRequest({
      input: struct.object({
        id: struct.number(),
      }),
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/null',
    })

    const ref = useBadRequest({ id: 'invalid' } as never)
    const [error] = await ref

    expect(error?.kind).toBe('definition')
    expect(ref.error?.kind).toBe('definition')
    expect(ref.status).toBe('error')
  })

  test('should cancel a pending request', async () => {
    const useDelay = defineRequest({
      build: (request, input) => {
        request.setQueryParams({
          ms: input.query.ms,
        })
      },
      input: struct.request({
        query: struct.object({
          ms: struct.number(),
        }),
      }),
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/delay',
    })

    const ref = useDelay({ query: { ms: 5000 } })
    ref.cancel()

    const [error] = await ref
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
    expect(ref.status).toBe('aborted')
  })

  test('should return transport error with ABORTED code when interceptor aborts', async () => {
    const abortingInterceptor = createHttpInterceptor(async (req, next) => {
      const result = await next(req)
      if (result.status === 200) {
        throw ERR_ABORTED
      }
      return result
    })

    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        abortingInterceptor,
        createHttpInterceptor(async () =>
          makeResponse({
            body: null,
            status: 200,
          }),
        ),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should use string error for non-ok response without output', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () => ({
          body: null,
          error: 'custom string error',
          headers: new Headers(),
          status: 500,
          statusText: 'Server Error',
          url: 'https://example.com/test',
        })),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toBe('custom string error')
  })

  test('should use string error for non-ok response with output schema', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () => ({
          body: { code: 'ERR' },
          error: 'custom string error',
          headers: new Headers([['content-type', 'application/json']]),
          status: 500,
          statusText: 'Server Error',
          url: 'https://example.com/test',
        })),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      output: {
        500: struct.object({ code: struct.string() }),
      },
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toBe('custom string error')
    if (error?.kind === 'http') {
      expect(error.data).toEqual({ code: 'ERR' })
    }
  })

  test('should return success for ok response without output', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: null,
            status: 204,
            url: 'https://example.com/test',
          }),
        ),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.ok).toBe(true)
  })

  test('should use Error message for non-ok response without output', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: null,
            status: 500,
            statusText: 'Internal Server Error',
            url: 'https://example.com/test',
          }),
        ),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toContain('500')
    expect(error?.message).toContain('Internal Server Error')
  })

  test('should use Error message for non-ok response with output schema', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: { code: 'ERR' },
            headers: new Headers([['content-type', 'application/json']]),
            status: 500,
            statusText: 'Server Error',
            url: 'https://example.com/test',
          }),
        ),
      ),
    )

    const useRequest = defineRequest({
      method: 'GET',
      output: {
        500: struct.object({ code: struct.string() }),
      },
      path: '/test',
    })

    const [error, result, response] = await useRequest().with({ client })

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toContain('500')
    expect(error?.message).toContain('Server Error')
    if (error?.kind === 'http') {
      expect(error.data).toEqual({ code: 'ERR' })
    }
  })

  test('should support timeout in second-stage config', async () => {
    const useDelay = defineRequest({
      build: (request, input) => {
        request.setQueryParams({
          ms: input.query.ms,
        })
      },
      input: struct.request({
        query: struct.object({
          ms: struct.number(),
        }),
      }),
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/delay',
    })

    const [error, result, response] = await useDelay({ query: { ms: 100 } }).with({
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
