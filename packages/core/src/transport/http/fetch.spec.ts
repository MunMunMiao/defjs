import { describe, expect, test } from 'vitest'
import type { HttpRequest } from '../../http'
import { ERR_INVALID_CLIENT_ENDPOINT } from '../../response'
import { __createRequest, __createRequestInit, __supportsStreamingRequestBody, ERR_STREAMING_REQUEST_UNSUPPORTED } from './fetch'

describe('Fetch handler request creation', () => {
  test('should create a request', async () => {
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    const body = { id: 1 }
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'POST',
      headers,
      body: { id: 1 },
      withCredentials: true,
    }
    const request = __createRequest(requestConfig)

    expect(request.url).toEqual(new URL(requestConfig.endpoint, requestConfig.baseEndpoint).toString())
    expect(await request.json()).toEqual(body)
    expect(request.headers.get('Content-Type')).toEqual('application/json')
    expect(request.method).toEqual('POST')
    expect(request.credentials).toEqual('include')
  })

  test('should add url search', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'GET',
      queryParams: new URLSearchParams({ id: '1' }),
    }

    const { url } = __createRequest(requestConfig)
    const { searchParams } = new URL(url)
    expect(searchParams.get('id')).toEqual('1')
  })

  test('should add content type when header not set', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'POST',
      body: {
        id: 1,
      },
    }

    const request = __createRequest(requestConfig)
    expect(request.headers.get('Content-Type')).toEqual('application/json')
  })

  test('should reject requests without baseEndpoint', () => {
    const requestConfig: HttpRequest = {
      endpoint: '/v1/user',
      method: 'GET',
    }

    expect(() => __createRequest(requestConfig)).toThrowError(ERR_INVALID_CLIENT_ENDPOINT)
  })

  test('should reject requests with invalid baseEndpoint', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: '/api',
      endpoint: '/v1/user',
      method: 'GET',
    }

    expect(() => __createRequest(requestConfig)).toThrowError(ERR_INVALID_CLIENT_ENDPOINT)
  })

  test('should auto set duplex half for ReadableStream body', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/stream',
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      }),
    }

    if (!__supportsStreamingRequestBody()) {
      expect(() => __createRequest(requestConfig)).toThrow(ERR_STREAMING_REQUEST_UNSUPPORTED)
      return
    }

    const init = __createRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })
})
