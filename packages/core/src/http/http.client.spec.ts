import { describe, expect, test, vi } from 'vitest'
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withQueryParamsSerializer } from '../client'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('request http runtime with client config', () => {
  test('should support queryParamsSerializer from client config', async () => {
    let capturedRequestUrl = ''

    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async (request) => {
          capturedRequestUrl = `${request.endpoint}?${request.queryString ?? ''}`
          return makeResponse({
            body: null,
            status: 200,
          })
        }),
      ),
      withQueryParamsSerializer((params) => {
        return Array.from(params.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => `${key.toUpperCase()}=${value}`)
          .join('&')
      }),
    )

    const useSerializedQuery = defineRequest({
      build: (request, input) => {
        request.setQueryParams({ a: input.query.a, b: input.query.b })
      },
      input: struct.request({ query: struct.object({ a: struct.string(), b: struct.string() }) }),
      method: 'GET',
      path: '/query',
    })

    const [error] = await client.execute(useSerializedQuery({ query: { a: '1', b: '2' } }))

    expect(error).toBeNull()
    expect(capturedRequestUrl).toBe('/query?A=1&B=2')
  })

  test('should use client http handle after interceptors', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://example.com/query?A=1&B=2')
      return new Response(null, {
        status: 200,
      })
    }) as unknown as typeof fetch
    let interceptorCalls = 0

    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async (request, next) => {
          interceptorCalls += 1
          return await next(request)
        }),
      ),
      withHTTPHandle(fetchMock),
      withQueryParamsSerializer((params) => {
        return Array.from(params.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => `${key.toUpperCase()}=${value}`)
          .join('&')
      }),
    )

    const useSerializedQuery = defineRequest({
      build: (request, input) => {
        request.setQueryParams({ a: input.query.a, b: input.query.b })
      },
      input: struct.request({ query: struct.object({ a: struct.string(), b: struct.string() }) }),
      method: 'GET',
      path: '/query',
    })

    const [error] = await client.execute(useSerializedQuery({ query: { a: '1', b: '2' } }))

    expect(error).toBeNull()
    expect(interceptorCalls).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
