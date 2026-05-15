import { afterEach, describe, expect, test, vi } from 'vitest'
import { ERR_ABORTED, ERR_NETWORK, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../http'
import { extractHeaders, xhrHandler } from './xhr'

describe('XHR Handler', () => {
  const originalXHR = globalThis.XMLHttpRequest
  let currentMockXhr: ReturnType<typeof createMockXhr>['mockXhr'] | undefined

  afterEach(() => {
    vi.unstubAllGlobals()
    currentMockXhr = undefined
  })

  function createMockXhr(options: {
    status?: number
    statusText?: string
    responseURL?: string
    response?: ArrayBuffer
    headers?: string
    readyState?: number
    errorType?: 'error' | 'timeout' | 'abort'
    sendDelay?: number
  } = {}) {
    const listeners: Record<string, Array<(event: Event) => void>> = {}
    const uploadListeners: Record<string, Array<(event: Event) => void>> = {}
    let aborted = false

    const XHR_UNSENT = 0
    const XHR_DONE = 4

    const mockXhr = {
      readyState: options.readyState ?? XHR_UNSENT,
      status: options.status ?? 200,
      statusText: options.statusText ?? 'OK',
      responseURL: options.responseURL ?? 'http://example.com/test',
      response: options.response ?? new ArrayBuffer(0),
      upload: {
        addEventListener: (type: string, fn: (event: Event) => void) => {
          uploadListeners[type] = uploadListeners[type] || []
          uploadListeners[type].push(fn)
        },
      },
      addEventListener: (type: string, fn: (event: Event) => void) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(fn)
      },
      removeEventListener: (type: string, fn: (event: Event) => void) => {
        listeners[type] = listeners[type]?.filter(f => f !== fn) || []
      },
      setRequestHeader: vi.fn(),
      open: vi.fn(),
      send: vi.fn((body) => {
        if (options.sendDelay !== undefined) {
          setTimeout(() => {
            if (options.errorType) {
              const event = new Event(options.errorType)
              listeners[options.errorType]?.forEach(fn => fn(event))
            } else {
              mockXhr.readyState = XHR_DONE
              listeners['load']?.forEach(fn => fn(new Event('load')))
            }
          }, options.sendDelay)
        } else {
          // synchronous resolution for simple cases
          mockXhr.readyState = XHR_DONE
          listeners['load']?.forEach(fn => fn(new Event('load')))
        }
      }),
      abort: vi.fn(() => {
        aborted = true
      }),
      getAllResponseHeaders: vi.fn(() => options.headers ?? 'content-type: application/json\r\n'),
      DONE: XHR_DONE,
    }

    currentMockXhr = mockXhr

    function MockXMLHttpRequest() {
      return mockXhr
    }

    return { listeners, mockXhr, MockXMLHttpRequest, uploadListeners }
  }

  test('should extract headers', () => {
    const headers = extractHeaders('content-type: application/json\r\nx-custom-header: custom-value')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-custom-header')).toBe('custom-value')
  })

  test('should return empty headers', () => {
    const headers = extractHeaders('')
    expect(Array.from(headers.keys()).length).toBe(0)
  })

  test('should throw error when XMLHttpRequest is not supported', async () => {
    vi.stubGlobal('XMLHttpRequest', undefined)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)
  })

  test('should create a request with mocked XHR', async () => {
    const { MockXMLHttpRequest } = createMockXhr({
      response: new TextEncoder().encode('{"ok":true}').buffer,
      headers: 'content-type: application/json\r\n',
    })
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      headers: new Headers([['Content-Type', 'application/json']]),
      method: 'POST',
      responseType: 'json',
    }

    const response = await xhrHandler(hq)

    expect(currentMockXhr!.open).toHaveBeenCalledWith('POST', expect.any(URL), true)
    expect(currentMockXhr!.setRequestHeader).toHaveBeenCalledWith('content-type', 'application/json')
    expect(currentMockXhr!.setRequestHeader).toHaveBeenCalledWith('Accept', 'application/json, text/plain, */*')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  test('should set withCredentials', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
      withCredentials: true,
    }

    await xhrHandler(hq)
    expect(currentMockXhr!.withCredentials).toBe(true)
  })

  test('should set default Accept header', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    await xhrHandler(hq)
    expect(currentMockXhr!.setRequestHeader).toHaveBeenCalledWith('Accept', 'application/json, text/plain, */*')
  })

  test('should not override existing Accept header', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      headers: new Headers([['Accept', 'text/html']]),
      method: 'GET',
    }

    await xhrHandler(hq)
    expect(currentMockXhr!.setRequestHeader).not.toHaveBeenCalledWith('accept', 'application/json, text/plain, */*')
    expect(currentMockXhr!.setRequestHeader).toHaveBeenCalledWith('accept', 'text/html')
  })

  test('should set Content-Type from body detection', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      body: new ArrayBuffer(0),
      method: 'POST',
    }

    await xhrHandler(hq)
    expect(currentMockXhr!.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream')
  })

  test('should reject ReadableStream body', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('test'))
        controller.close()
      },
    })

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      body: stream,
      method: 'POST',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('STREAMING')
  })

  test('should handle timeout error', async () => {
    const { MockXMLHttpRequest } = createMockXhr({ errorType: 'timeout', sendDelay: 10 })
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    const promise = xhrHandler(hq)
    await new Promise(resolve => setTimeout(resolve, 20))

    const { error } = await promise
    expect(error).toBe(ERR_TIMEOUT)
  })

  test('should handle error event', async () => {
    const { MockXMLHttpRequest } = createMockXhr({ errorType: 'error', sendDelay: 10 })
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    const promise = xhrHandler(hq)
    await new Promise(resolve => setTimeout(resolve, 20))

    const { error } = await promise
    expect(error).toBe(ERR_NETWORK)
  })

  test('should handle abort event', async () => {
    const { MockXMLHttpRequest } = createMockXhr({ errorType: 'abort', sendDelay: 10 })
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    const promise = xhrHandler(hq)
    await new Promise(resolve => setTimeout(resolve, 20))

    const { error } = await promise
    expect(error).toBe(ERR_ABORTED)
  })

  test('should handle body parse error', async () => {
    const { MockXMLHttpRequest } = createMockXhr({
      response: new TextEncoder().encode('not json').buffer,
      headers: 'content-type: application/json\r\n',
    })
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
      responseType: 'json',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)
  })

  test('should call upload progress', async () => {
    const { MockXMLHttpRequest, uploadListeners } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const uploadProgress = vi.fn()
    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      body: 'test body',
      method: 'POST',
      uploadProgress,
    }

    await xhrHandler(hq)

    // Trigger upload progress event
    uploadListeners['progress']?.forEach(fn =>
      fn(Object.assign(new Event('progress'), { lengthComputable: true, loaded: 50, total: 100 })),
    )

    expect(uploadProgress).toHaveBeenCalledWith(expect.objectContaining({ loaded: 50, total: 100 }))
  })

  test('should call download progress', async () => {
    const { MockXMLHttpRequest, listeners } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const downloadProgress = vi.fn()
    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
      downloadProgress,
    }

    await xhrHandler(hq)

    // Trigger download progress event
    listeners['progress']?.forEach(fn =>
      fn(Object.assign(new Event('progress'), { lengthComputable: true, loaded: 50, total: 100 })),
    )

    expect(downloadProgress).toHaveBeenCalledWith(expect.objectContaining({ loaded: 50, total: 100 }))
  })

  test('should abort XHR when signal is aborted', async () => {
    const { MockXMLHttpRequest } = createMockXhr({ sendDelay: 50 })
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const controller = new AbortController()
    const hq: HttpRequest = {
      abort: controller.signal,
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    const promise = xhrHandler(hq)
    controller.abort()

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(currentMockXhr!.abort).toHaveBeenCalled()

    // clean up pending promise
    try { await promise } catch { /* ignore */ }
  })

  test('should not abort XHR when already done', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const controller = new AbortController()
    const hq: HttpRequest = {
      abort: controller.signal,
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
    }

    await xhrHandler(hq)
    controller.abort()
    expect(currentMockXhr!.abort).not.toHaveBeenCalled()
  })

  test('should set timeout', async () => {
    const { MockXMLHttpRequest } = createMockXhr()
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest)

    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/test',
      method: 'GET',
      timeout: 5000,
    }

    await xhrHandler(hq)
    expect(currentMockXhr!.timeout).toBe(5000)
  })
})
