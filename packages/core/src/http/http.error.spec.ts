import { beforeEach, describe, expect, inject, test, vi } from 'vitest'
import { createClient, withEndpoint, withHTTPHandle, withInterceptors } from '../client'
import type { Client } from '../client'
import { ERR_ABORTED } from '../error'
import { createHttpInterceptor } from '../interceptor'
import type { HttpResponse } from '../internal/http_response'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineRequest } from './index'
import type { HttpExecuteOptions } from './http'

describe('request http runtime errors', () => {
  let client: Client

  beforeEach(() => {
    client = createClient(withEndpoint(inject('testServerHost')))
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

    const [error, result, response] = await client.execute(useMissingAccount())

    expect(result).toBeUndefined()
    expect(response?.ok).toBe(false)
    expect(response?.status).toBe(404)
    expect(response?.error).toBeUndefined()
    expect(error?.kind).toBe('http')

    if (error?.kind !== 'http') {
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

    const [error, result, response] = await client.execute(useValidatedRequest({ id: 'oops' } as never))

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')

    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should stop before build and transport when a declared request section is missing', async () => {
    let buildCalls = 0
    let transportCalls = 0
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () => {
          transportCalls += 1
          return makeResponse({ status: 200 })
        }),
      ),
    )
    const useRequest = defineRequest({
      build() {
        buildCalls += 1
      },
      input: struct.request({
        query: struct.object({ page: struct.number().optional() }),
      }),
      method: 'GET',
      path: '/search',
    })

    const [error, result, response] = await guardedClient.execute(useRequest({} as never))

    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(buildCalls).toBe(0)
    expect(transportCalls).toBe(0)
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

    const [error, result, response] = await client.execute(useBadResponse())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(200)
    expect(error?.kind).toBe('definition')

    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('RESPONSE_VALIDATION_FAILED')
  })

  test.each([
    { path: '/text', status: 200 },
    { path: '/json/malformed-error', status: 500 },
  ])('should stop on a declared response representation error for status $status', async ({ path, status }) => {
    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({ id: struct.number() }),
        500: struct.object({ code: struct.string() }),
      },
      path,
    })

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(status)
    expect(response?.error).toBeInstanceOf(SyntaxError)
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('RESPONSE_VALIDATION_FAILED')
    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }
    expect(error.cause).toBe(response?.error)
    expect(error && 'data' in error).toBe(false)
  })

  test('should prefer undeclared status over a response representation error', async () => {
    const useRequest = defineRequest({
      method: 'GET',
      output: { 200: struct.null() },
      path: '/json/malformed-error',
    })

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response?.error).toBeInstanceOf(SyntaxError)
    expect(error?.code).toBe('UNDECLARED_STATUS')
    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }
    expect(error.cause).not.toBe(response?.error)
  })

  test('should return undeclared status failures as definition errors', async () => {
    const useUndeclaredStatus = defineRequest({
      method: 'GET',
      output: {
        200: struct.null(),
      },
      path: '/500',
    })

    const [error, result, response] = await client.execute(useUndeclaredStatus())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('definition')

    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('UNDECLARED_STATUS')
  })

  test('should return definition error when build throws', async () => {
    const useBadBuild = defineRequest({
      build: () => {
        throw new Error('build failed')
      },
      input: struct.object({}),
      method: 'GET',
      path: '/test',
    })

    const [error, result, response] = await client.execute(useBadBuild({}))

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')

    if (error?.kind !== 'definition') {
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

    const [error, result, response] = await client.execute(useIntercepted())

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (error?.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('NETWORK_ERROR')
  })

  test.each([
    ['abort', 'ABORTED'],
    ['timeout', 'TIMEOUT'],
  ] as const)('should cancel a hanging interceptor on %s', async (mode, expectedCode) => {
    const controller = new AbortController()
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () => {
          markStarted()
          return await new Promise(() => undefined)
        }),
      ),
    )
    const useRequest = defineRequest({ method: 'GET', path: '/hanging-interceptor' })
    const pending = guardedClient.execute(useRequest(), mode === 'abort' ? { signal: controller.signal } : { timeout: 1 })

    await started
    if (mode === 'abort') {
      controller.abort('caller stopped')
    }
    const result = await Promise.race([pending, new Promise<false>((resolve) => setTimeout(() => resolve(false), 100))])

    expect(result).not.toBe(false)
    if (result === false) {
      throw new Error('Expected interceptor cancellation to settle')
    }
    expect(result[0]).toMatchObject({ code: expectedCode, kind: 'transport' })
  })

  test('should prefer cancellation when an interceptor aborts and returns a response', async () => {
    const controller = new AbortController()
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () => {
          controller.abort('caller stopped')
          return makeResponse({ status: 200 })
        }),
      ),
    )
    const useRequest = defineRequest({ method: 'GET', path: '/cached' })

    const [error, result, response] = await guardedClient.execute(useRequest(), { signal: controller.signal })

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
  })

  test.each(['return', 'throw'] as const)('should abort a hidden transport when an interceptor chain settles by %s', async (mode) => {
    const interceptorError = new Error('interceptor failed')
    let hiddenResponse: Promise<HttpResponse<unknown>> | undefined
    let transportSignal: AbortSignal | undefined
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const fetchMock = vi.fn(async (request: Request) => {
      transportSignal = request.signal
      markStarted()
      return await new Promise<Response>(() => undefined)
    }) as unknown as typeof fetch
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withHTTPHandle(fetchMock),
      withInterceptors(
        createHttpInterceptor(async (request, next) => {
          hiddenResponse = next(request)
          await started
          if (mode === 'throw') {
            throw interceptorError
          }
          return makeResponse({ status: 204 })
        }),
      ),
    )
    const useRequest = defineRequest({ method: 'GET', path: '/hidden' })

    const [error, result, response] = await guardedClient.execute(useRequest())

    expect(transportSignal?.aborted).toBe(true)
    await expect(hiddenResponse).resolves.toMatchObject({ error: ERR_ABORTED, status: 0 })
    if (mode === 'throw') {
      expect(error).toMatchObject({ cause: interceptorError, code: 'NETWORK_ERROR' })
      expect(response).toBeUndefined()
    } else {
      expect(error).toBeNull()
      expect(response?.status).toBe(204)
    }
    expect(result).toBeUndefined()
  })

  test('should reject interceptor next calls after the HTTP chain settles', async () => {
    let lateResponse: Promise<HttpResponse<unknown>> | undefined
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withHTTPHandle(fetchMock as unknown as typeof fetch),
      withInterceptors(
        createHttpInterceptor(async (request, next) => {
          setTimeout(() => {
            lateResponse = next(request)
            void lateResponse.catch(() => undefined)
          }, 0)
          return makeResponse({ status: 204 })
        }),
      ),
    )
    const useRequest = defineRequest({ method: 'GET', path: '/cached' })

    const [error] = await guardedClient.execute(useRequest())
    await vi.waitFor(() => expect(lateResponse).toBeDefined())

    expect(error).toBeNull()
    await expect(lateResponse).rejects.toThrow('HTTP interceptor next() cannot be called after the chain has settled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([ERR_ABORTED, 'caller stopped', new Error('Request timed out')])(
    'should return aborted error when signal is already aborted with %s',
    async (reason) => {
      const controller = new AbortController()
      controller.abort(reason)
      const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
      const guardedClient = createClient(withEndpoint('https://example.com'), withHTTPHandle(fetchMock as unknown as typeof fetch))

      const useRequest = defineRequest({
        method: 'GET',
        output: {
          200: struct.null(),
        },
        path: '/null',
      })

      const [error, result, response] = await guardedClient.execute(useRequest(), { signal: controller.signal })

      expect(result).toBeUndefined()
      expect(response).toBeUndefined()
      expect(error?.kind).toBe('transport')
      expect(error?.code).toBe('ABORTED')
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

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

    const [error, result, response] = await client.execute(useRequest({ id: 1 } as never), {
      abort: controller.signal,
      timeout: 1,
    } as never)

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
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

    const [error, result, response] = await client.execute(useRequest(undefined), { abort: controller.signal, timeout: 1 } as never)

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  })

  test.each([-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'should reject invalid timeout %s before HTTP transport',
    async (timeout) => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
      const guardedClient = createClient(withEndpoint('https://example.com'), withHTTPHandle(fetchMock as unknown as typeof fetch))
      const useRequest = defineRequest({ method: 'GET', path: '/timeout' })

      const [error, result, response] = await guardedClient.execute(useRequest(), { timeout })

      expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
      expect(result).toBeUndefined()
      expect(response).toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  test('should prefer invalid timeout over an already aborted HTTP signal alias', async () => {
    const controller = new AbortController()
    controller.abort('caller stopped')
    const useRequest = defineRequest({ method: 'GET', path: '/timeout' })

    const [error] = await client.execute(useRequest(), { signal: controller.signal, timeout: 0 })

    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
  })

  test('should snapshot HTTP cancellation options before asynchronous work', async () => {
    let timeoutReads = 0
    const options = {
      get timeout() {
        timeoutReads += 1
        return timeoutReads === 1 ? undefined : Number.POSITIVE_INFINITY
      },
    }
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const guardedClient = createClient(withEndpoint('https://example.com'), withHTTPHandle(fetchMock as unknown as typeof fetch))
    const useRequest = defineRequest({ method: 'GET', path: '/snapshot' })

    const [error, result, response] = await guardedClient.execute(useRequest(), options as HttpExecuteOptions)

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.status).toBe(204)
    expect(timeoutReads).toBe(1)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  test('should return a definition error when reading HTTP cancellation options throws', async () => {
    const options = Object.defineProperty({}, 'abort', {
      get() {
        throw new Error('abort getter failed')
      },
    })
    const useRequest = defineRequest({ method: 'GET', path: '/snapshot' })

    const [error, result, response] = await client.execute(useRequest(), options as HttpExecuteOptions)

    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
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

    const [error, result, response] = await client.execute(useRequest(undefined), { abort: signal })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should classify a status-zero interceptor response as a transport error', async () => {
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(createHttpInterceptor(async () => makeResponse({ error: ERR_ABORTED }))),
    )
    const useRequest = defineRequest({ method: 'GET', path: '/transport-error' })

    const [error, result, response] = await guardedClient.execute(useRequest())

    expect(error).toMatchObject({ cause: ERR_ABORTED, code: 'ABORTED', kind: 'transport' })
    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
  })

  test('should classify an async download observer rejection as a transport error', async () => {
    const observerError = new Error('download observer failed')
    const guardedClient = createClient(
      withEndpoint('https://example.com'),
      withHTTPHandle(async () => new Response('ok', { headers: { 'content-type': 'text/plain' } })),
    )
    const useRequest = defineRequest({
      method: 'GET',
      output: { 200: struct.string() },
      path: '/download',
      responseType: 'text',
    })

    const [error, result, response] = await guardedClient.execute(useRequest(), {
      async onDownloadProgress() {
        throw observerError
      },
    })

    expect(error).toMatchObject({ cause: observerError, code: 'NETWORK_ERROR', kind: 'transport' })
    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
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

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toContain('500')
  })

  test('should use HTTP status message when response.error is undefined with output struct', async () => {
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

    const [error, result, response] = await client.execute(useRequest())

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

    const [error] = await client.execute(useBadRequest({ id: 'invalid' } as never))

    expect(error?.kind).toBe('definition')
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

    const controller = new AbortController()
    const command = useDelay({ query: { ms: 5000 } })
    const promise = client.execute(command, { signal: controller.signal })
    controller.abort()

    const [error] = await promise
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
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

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should ignore a representation error when output is not declared', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: null,
            error: 'custom string error',
            headers: new Headers(),
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

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toBe('Http failure response for https://example.com/test: 500 - Server Error')
  })

  test('should classify an explicit response error before parsing a declared output struct', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: { code: 'ERR' },
            error: 'custom string error',
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

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('definition')
    expect(error?.message).toBe('custom string error')
    expect(error?.code).toBe('RESPONSE_VALIDATION_FAILED')
    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }
    expect(error.cause).toBe('custom string error')
    expect(error && 'data' in error).toBe(false)
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

    const [error, result, response] = await client.execute(useRequest())

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

    const [error, result, response] = await client.execute(useRequest())

    expect(result).toBeUndefined()
    expect(response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.message).toContain('500')
    expect(error?.message).toContain('Internal Server Error')
  })

  test('should use Error message for non-ok response with output struct', async () => {
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

    const [error, result, response] = await client.execute(useRequest())

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

    const [error, result, response] = await client.execute(useDelay({ query: { ms: 100 } }), { timeout: 10 })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (error?.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('TIMEOUT')
  })
})
