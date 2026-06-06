import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint, withInterceptors, withQueryParamsSerializer } from '../client'
import { ERR_NOT_FOUND_GLOBAL_CLIENT } from '../error'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('request http runtime with client config', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should support queryParamsSerializer from client config', async () => {
    let capturedRequestUrl = ''

    setGlobalClient(
      createClient(
        withEndpoint('https://example.com'),
        withInterceptors(
          createHttpInterceptor(async request => {
            capturedRequestUrl = `${request.endpoint}?${request.queryString ?? ''}`
            return makeResponse({
              body: null,
              status: 200,
            })
          }),
        ),
        withQueryParamsSerializer(params => {
          return Array.from(params.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key.toUpperCase()}=${value}`)
            .join('&')
        }),
      ),
    )

    const useSerializedQuery = defineRequest({
      build: (request, input) => {
        request.setQueryParams({ a: input.query.a, b: input.query.b })
      },
      input: struct.request({ query: struct.object({ a: struct.string(), b: struct.string() }) }),
      method: 'GET',
      path: '/query',
    })

    const [error] = await useSerializedQuery()

    expect(error).toBeNull()
    expect(capturedRequestUrl).toBe('/query?A=1&B=2')
  })

  test('should resolve client from config first and then from global client', async () => {
    resetGlobalClient()

    const localClient = createClient(
      withEndpoint('https://example.com/api'),
      withInterceptors(
        createHttpInterceptor(async request =>
          makeResponse({
            body: {
              endpoint: request.baseEndpoint,
            },
            status: 200,
          }),
        ),
      ),
    )

    const useGetInfo = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          endpoint: struct.string(),
        }),
      },
      path: '/info',
    })

    const [localError, localResult] = await useGetInfo().with({
      client: localClient,
    })

    expect(localError).toBeNull()
    expect(localResult).toEqual({
      endpoint: 'https://example.com/api',
    })

    const [missingClientError] = await useGetInfo()

    expect(missingClientError?.kind).toBe('transport')
    expect(missingClientError?.message).toContain(ERR_NOT_FOUND_GLOBAL_CLIENT.message)
  })
})
