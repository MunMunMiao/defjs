import { describe, expect, test, vi } from 'vitest'
import type { HttpRequest } from '../../http'
import { __createRequest, __supportsStreamingRequestBody, ERR_STREAMING_REQUEST_UNSUPPORTED, fetchHandler } from './fetch'

describe('Fetch handler streaming', () => {
  test('should throw when runtime does not support streaming request bodies', () => {
    class FakeRequest {
      body = null

      constructor(_input: URL | string, init?: RequestInit & { duplex?: 'half' }) {
        if (init?.body instanceof ReadableStream) {
          throw new TypeError('ReadableStream request bodies are not supported')
        }
      }
    }

    vi.stubGlobal('Request', FakeRequest)

    expect(__supportsStreamingRequestBody()).toBe(false)

    const requestConfig: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/stream',
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      }),
    }

    expect(() => __createRequest(requestConfig)).toThrow(ERR_STREAMING_REQUEST_UNSUPPORTED)

    vi.unstubAllGlobals()
  })

  test('should call uploadProgress for ReadableStream body', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4, 5]))
        controller.close()
      },
    })

    if (!__supportsStreamingRequestBody()) {
      await expect(
        fetchHandler({
          body: stream,
          endpoint: '/upload',
          baseEndpoint: 'https://example.com',
          method: 'POST',
          responseType: 'text',
        }),
      ).rejects.toBe(ERR_STREAMING_REQUEST_UNSUPPORTED)
      return
    }

    const progressEvents: Array<{ lengthComputable: boolean; loaded: number; total: number }> = []
    const fetchMock = vi.fn(async (request: Request) => {
      const reader = request.body?.getReader()

      if (reader) {
        while (true) {
          const { done } = await reader.read()
          if (done) {
            break
          }
        }
      }

      return new Response('ok', {
        headers: {
          'content-type': 'text/plain',
        },
        status: 200,
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    try {
      const response = await fetchHandler({
        body: stream,
        endpoint: '/upload',
        baseEndpoint: 'https://example.com',
        method: 'POST',
        responseType: 'text',
        uploadProgress(event) {
          progressEvents.push({
            lengthComputable: event.lengthComputable,
            loaded: event.loaded,
            total: event.total,
          })
        },
      })

      expect(response.body).toBe('ok')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(progressEvents.length).toBeGreaterThan(0)
      expect(progressEvents.at(-1)?.loaded).toBeGreaterThan(0)
      expect(progressEvents.every(event => event.lengthComputable === false && event.total === 0)).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
