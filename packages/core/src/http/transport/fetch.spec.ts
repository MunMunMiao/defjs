import { describe, expect, test, vi } from 'vitest'
import { ERR_INVALID_CLIENT_ENDPOINT } from '../../error'
import type { HttpRequest } from '../../http'
import {
  createFetchRequest,
  createFetchRequestInit,
  ERR_STREAMING_REQUEST_UNSUPPORTED,
  fetchHandler,
  supportsStreamingRequestBody,
} from './fetch'

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
    const request = createFetchRequest(requestConfig)
    const init = createFetchRequestInit(requestConfig)

    expect(request.url).toEqual(new URL(requestConfig.endpoint, requestConfig.baseEndpoint).toString())
    expect(await request.json()).toEqual(body)
    expect(request.headers.get('Content-Type')).toEqual('application/json')
    expect(request.method).toEqual('POST')
    expect(init.credentials).toEqual('include')
    if (request.credentials !== undefined) {
      expect(request.credentials).toEqual('include')
    }
  })

  test('should add url search', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'GET',
      queryParams: new URLSearchParams({ id: '1' }),
    }

    const { url } = createFetchRequest(requestConfig)
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

    const request = createFetchRequest(requestConfig)
    expect(request.headers.get('Content-Type')).toEqual('application/json')
  })

  test('should apply final body content type after configured headers', () => {
    const jsonBody = { id: 1 }
    const jsonRequest: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers([['Content-Type', 'text/plain']]),
      method: 'POST',
      body: jsonBody,
    }

    const serializedJson = '{"id":1}'
    const builderRequest: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers([['Content-Type', 'text/plain']]),
      method: 'POST',
      body: serializedJson,
      bodyContentType: 'application/json',
      bodyContentTypeSource: serializedJson,
    }

    const binaryRequest: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/upload',
      headers: new Headers([['Content-Type', 'text/plain']]),
      method: 'POST',
      body: new ArrayBuffer(0),
    }

    expect((createFetchRequestInit(jsonRequest).headers as Headers).get('content-type')).toBe('application/json')
    expect((createFetchRequestInit(builderRequest).headers as Headers).get('content-type')).toBe('application/json')
    expect((createFetchRequestInit(binaryRequest).headers as Headers).get('content-type')).toBe('application/octet-stream')
  })

  test('should remove or suppress Content-Type from final body rules', () => {
    const formDataRequest: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/upload',
      headers: new Headers([['Content-Type', 'multipart/form-data']]),
      method: 'POST',
      body: new FormData(),
    }

    const textBody = 'hello'
    const suppressedRequest: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/text',
      headers: new Headers([['Content-Type', 'text/plain']]),
      method: 'POST',
      body: textBody,
      bodyContentType: null,
      bodyContentTypeSource: textBody,
    }

    expect((createFetchRequestInit(formDataRequest).headers as Headers).has('content-type')).toBe(false)
    expect((createFetchRequestInit(suppressedRequest).headers as Headers).has('content-type')).toBe(false)
  })

  test('should reject requests without baseEndpoint', () => {
    const requestConfig: HttpRequest = {
      endpoint: '/v1/user',
      method: 'GET',
    }

    expect(() => createFetchRequest(requestConfig)).toThrowError(ERR_INVALID_CLIENT_ENDPOINT)
  })

  test('should reject requests with invalid baseEndpoint', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: '/api',
      endpoint: '/v1/user',
      method: 'GET',
    }

    expect(() => createFetchRequest(requestConfig)).toThrowError(ERR_INVALID_CLIENT_ENDPOINT)
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

    if (!supportsStreamingRequestBody()) {
      expect(() => createFetchRequest(requestConfig)).toThrow(ERR_STREAMING_REQUEST_UNSUPPORTED)
      return
    }

    const init = createFetchRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })

  test('should return zero for negative Content-Length', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers([['Content-Length', '-1']]),
      method: 'POST',
      uploadProgress: vi.fn(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      }),
    }

    if (!supportsStreamingRequestBody()) {
      return
    }

    const init = createFetchRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })

  test('should return false when ReadableStream is undefined', () => {
    vi.stubGlobal('ReadableStream', undefined)
    expect(supportsStreamingRequestBody()).toBe(false)
    vi.unstubAllGlobals()
  })

  test('should return zero for invalid Content-Length', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers([['Content-Length', 'not-a-number']]),
      method: 'POST',
      uploadProgress: vi.fn(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      }),
    }

    if (!supportsStreamingRequestBody()) {
      return
    }

    const init = createFetchRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })

  test('should return zero for non-finite Content-Length', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers([['Content-Length', 'Infinity']]),
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      }),
    }

    if (!supportsStreamingRequestBody()) {
      return
    }

    const init = createFetchRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })

  test('should parse positive Content-Length for upload progress', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers([['Content-Length', '100']]),
      method: 'POST',
      uploadProgress: vi.fn(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      }),
    }

    if (!supportsStreamingRequestBody()) {
      return
    }

    const init = createFetchRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })

  test('should return zero for missing Content-Length', () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      headers: new Headers(),
      method: 'POST',
      uploadProgress: vi.fn(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      }),
    }

    if (!supportsStreamingRequestBody()) {
      return
    }

    const init = createFetchRequestInit(requestConfig)
    expect(init.duplex).toBe('half')
  })

  test('should handle fetch network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network request failed')
      }),
    )

    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'GET',
    }

    const response = await fetchHandler(requestConfig)

    expect(response.error).toBeInstanceOf(TypeError)
    expect(response.status).toBe(0)
  })

  test('should handle upload progress stream cancel', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.close()
      },
    })

    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/upload',
      method: 'POST',
      body: stream,
      uploadProgress: vi.fn(),
    }

    const init = createFetchRequestInit(requestConfig)
    const wrappedStream = init.body as ReadableStream<Uint8Array>
    const reader = wrappedStream.getReader()

    // Read one chunk
    const { value } = await reader.read()
    expect(value).toBeDefined()

    // Cancel the stream
    await reader.cancel('test-cancel')
  })
})
