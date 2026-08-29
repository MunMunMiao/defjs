import { afterEach, describe, expect, test, vi } from 'vitest'
import { ERR_ABORTED } from '../../error'
import type { HttpRequest } from '../../http'
import {
  __resetStreamingRequestBodySupportForTests,
  createFetchRequest,
  createFetchRequestInit,
  ERR_STREAMING_REQUEST_UNSUPPORTED,
  fetchHandler,
  supportsStreamingRequestBody,
} from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
  __resetStreamingRequestBodySupportForTests()
})

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

    expect(supportsStreamingRequestBody()).toBe(false)

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

    expect(() => createFetchRequest(requestConfig)).toThrow(ERR_STREAMING_REQUEST_UNSUPPORTED)
  })

  test('should call uploadProgress for ReadableStream body', async () => {
    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4, 5]))
        controller.close()
      },
    })

    if (!supportsStreamingRequestBody()) {
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
        abort: controller.signal,
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
      expect(progressEvents.every((event) => event.lengthComputable === false && event.total === 0)).toBe(true)
      expect(progressEvents.map((event) => event.loaded)).toEqual([2, 5])
      expect(progressEvents.at(-1)?.total).toBe(0)
      expect(stream.locked).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('should preserve an async upload observer error and unlock without waiting for cancellation', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const observerError = new Error('observer failed')
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
      },
    })
    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      body: stream,
      endpoint: '/upload',
      method: 'POST',
      async uploadProgress() {
        await Promise.resolve()
        throw observerError
      },
    })
    const reader = (init.body as ReadableStream<Uint8Array>).getReader()

    await expect(settleWithin(reader.read())).rejects.toBe(observerError)
    expect(cancel).toHaveBeenCalledExactlyOnceWith(observerError)
    expect(stream.locked).toBe(false)
  })

  test('should unlock an upload body without waiting for consumer cancellation', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      body: stream,
      endpoint: '/upload',
      method: 'POST',
      uploadProgress: vi.fn(),
    })
    const reader = (init.body as ReadableStream<Uint8Array>).getReader()

    await expect(settleWithin(reader.cancel('consumer canceled'))).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledExactlyOnceWith('consumer canceled')
    expect(stream.locked).toBe(false)
  })

  test('should clean up a wrapped upload body when Request construction fails', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    class FailingRequest {
      constructor() {
        throw new TypeError('Request construction failed')
      }
    }

    vi.stubGlobal('Request', FailingRequest)
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const fetchMock = vi.fn<typeof fetch>()
    const response = await settleWithin(
      fetchHandler(
        {
          baseEndpoint: 'https://example.com',
          body: stream,
          endpoint: '/upload',
          method: 'POST',
          uploadProgress: vi.fn(),
        },
        fetchMock,
      ),
    )

    expect(response.error).toBeInstanceOf(TypeError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(response.error)
    expect(stream.locked).toBe(false)
  })

  test('should clean up a wrapped upload body when fetch rejects', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const networkError = new Error('network failed')
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const fetchMock = vi.fn(async () => {
      throw networkError
    })
    const response = await settleWithin(
      fetchHandler(
        {
          baseEndpoint: 'https://example.com',
          body: stream,
          endpoint: '/upload',
          method: 'POST',
          uploadProgress: vi.fn(),
        },
        fetchMock,
      ),
    )

    expect(response.error).toBe(networkError)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(networkError)
    expect(stream.locked).toBe(false)
  })

  test('should clean up an upload body for a pre-aborted signal', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const controller = new AbortController()
    controller.abort()
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const fetchMock = vi.fn<typeof fetch>()
    const response = await settleWithin(
      fetchHandler(
        {
          abort: controller.signal,
          baseEndpoint: 'https://example.com',
          body: stream,
          endpoint: '/upload',
          method: 'POST',
          uploadProgress: vi.fn(),
        },
        fetchMock,
      ),
    )

    expect(response.error).toBe(ERR_ABORTED)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(controller.signal.reason)
    expect(stream.locked).toBe(false)
  })

  test('should unlock an upload body when a custom fetch ignores abort', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const controller = new AbortController()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    const pending = fetchHandler(
      {
        abort: controller.signal,
        baseEndpoint: 'https://example.com',
        body: stream,
        endpoint: '/upload',
        method: 'POST',
        uploadProgress: vi.fn(),
      },
      fetchMock as unknown as typeof fetch,
    )

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    controller.abort()

    await expect(settleWithin(pending)).resolves.toMatchObject({ error: ERR_ABORTED })
    expect(cancel).toHaveBeenCalledExactlyOnceWith(controller.signal.reason)
    expect(stream.locked).toBe(false)
  })

  test('should unlock an upload body when a custom fetch consumes it and ignores abort', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const controller = new AbortController()
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    let startPull!: () => void
    const pullStarted = new Promise<void>((resolve) => {
      startPull = resolve
    })
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel,
        pull() {
          startPull()
          return new Promise<void>(() => undefined)
        },
      },
      { highWaterMark: 0 },
    )
    let startConsuming!: () => void
    const consumingStarted = new Promise<void>((resolve) => {
      startConsuming = resolve
    })
    const fetchMock = vi.fn(async (request: Request) => {
      const consuming = request.arrayBuffer()
      startConsuming()
      await consuming
      return new Response()
    })
    const pending = fetchHandler(
      {
        abort: controller.signal,
        baseEndpoint: 'https://example.com',
        body: stream,
        endpoint: '/upload',
        method: 'POST',
        uploadProgress: vi.fn(),
      },
      fetchMock as unknown as typeof fetch,
    )

    await consumingStarted
    await pullStarted
    controller.abort()

    await expect(settleWithin(pending)).resolves.toMatchObject({ error: ERR_ABORTED })
    expect(cancel).toHaveBeenCalledExactlyOnceWith(controller.signal.reason)
    expect(stream.locked).toBe(false)
  })

  test.each([false, true])('should clean up once when upload progress cancels its consumer (throw: %s)', async (throwAfterCancel) => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
      },
    })
    const observerError = new Error('observer failed after cancel')
    let reader: ReadableStreamDefaultReader<Uint8Array>
    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      body: stream,
      endpoint: '/upload',
      method: 'POST',
      uploadProgress() {
        void reader.cancel('observer canceled')
        if (throwAfterCancel) {
          throw observerError
        }
      },
    })
    reader = (init.body as ReadableStream<Uint8Array>).getReader()

    await expect(settleWithin(reader.read())).resolves.toEqual({ done: true, value: undefined })
    expect(cancel).toHaveBeenCalledExactlyOnceWith('observer canceled')
    expect(stream.locked).toBe(false)
  })

  test('should preserve a fetch error when its request body is already locked', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const networkError = new Error('network failed')
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const fetchMock = vi.fn(async (request: Request) => {
      reader = request.body?.getReader()
      throw networkError
    })
    const response = await fetchHandler(
      {
        baseEndpoint: 'https://example.com',
        body: stream,
        endpoint: '/upload',
        method: 'POST',
        uploadProgress: vi.fn(),
      },
      fetchMock as unknown as typeof fetch,
    )

    expect(response.error).toBe(networkError)
    expect(cancel).not.toHaveBeenCalled()
    await expect(reader?.cancel(networkError)).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(networkError)
    expect(stream.locked).toBe(false)
  })

  test.each([
    {
      body: () => {
        const formData = new FormData()
        formData.append('name', 'miao')
        return formData
      },
      name: 'FormData',
    },
    {
      body: () => new Blob(['hello-upload'], { type: 'text/plain' }),
      name: 'Blob',
    },
    {
      body: () => new TextEncoder().encode('bytes-upload').buffer,
      name: 'ArrayBuffer',
    },
  ])('should call uploadProgress for a $name body', async ({ body }) => {
    if (!supportsStreamingRequestBody()) {
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
        headers: { 'content-type': 'text/plain' },
        status: 200,
      })
    })

    const response = await fetchHandler(
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        body: body(),
        endpoint: '/upload',
        method: 'POST',
        responseType: 'text',
        uploadProgress(event) {
          progressEvents.push({
            lengthComputable: event.lengthComputable,
            loaded: event.loaded,
            total: event.total,
          })
        },
      },
      fetchMock as unknown as typeof fetch,
    )

    expect(response.body).toBe('ok')
    expect(progressEvents.length).toBeGreaterThanOrEqual(2)
    expect(progressEvents[0]).toMatchObject({ lengthComputable: true, loaded: 0 })
    expect(progressEvents[0]?.total).toBeGreaterThan(0)
    const complete = progressEvents.at(-1)
    expect(complete?.lengthComputable).toBe(true)
    expect(complete?.loaded).toBe(complete?.total)
    expect(complete?.total).toBeGreaterThan(0)
  })

  test('should skip upload wrapping for non-streamable bodies without a counted type', async () => {
    const uploadProgress = vi.fn()
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }))

    const response = await fetchHandler(
      {
        baseEndpoint: 'https://example.com',
        body: 'plain-text-body',
        endpoint: '/upload',
        method: 'POST',
        responseType: 'text',
        uploadProgress,
      },
      fetchMock as unknown as typeof fetch,
    )

    expect(response.body).toBe('ok')
    expect(uploadProgress).not.toHaveBeenCalled()
  })

  test('should report upload progress for an empty Blob without a content type', async () => {
    if (!supportsStreamingRequestBody()) {
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
      return new Response('ok', { headers: { 'content-type': 'text/plain' }, status: 200 })
    })

    const response = await fetchHandler(
      {
        baseEndpoint: 'https://example.com',
        body: new Blob([]),
        bodyContentType: 'application/octet-stream',
        endpoint: '/upload',
        method: 'POST',
        responseType: 'text',
        uploadProgress(event) {
          progressEvents.push({
            lengthComputable: event.lengthComputable,
            loaded: event.loaded,
            total: event.total,
          })
        },
      },
      fetchMock as unknown as typeof fetch,
    )

    expect(response.body).toBe('ok')
    expect(progressEvents[0]).toEqual({ lengthComputable: false, loaded: 0, total: 0 })
  })

  test('should cancel a converted upload stream when the start observer throws', async () => {
    if (!supportsStreamingRequestBody()) {
      return
    }

    const observerError = new Error('start failed')
    const response = await fetchHandler(
      {
        baseEndpoint: 'https://example.com',
        body: new Blob(['hello']),
        endpoint: '/upload',
        method: 'POST',
        responseType: 'text',
        async uploadProgress() {
          throw observerError
        },
      },
      vi.fn(async () => new Response('ok')) as unknown as typeof fetch,
    )

    expect(response.error).toBe(observerError)
  })
})

function settleWithin<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('operation did not settle')), 100)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}
