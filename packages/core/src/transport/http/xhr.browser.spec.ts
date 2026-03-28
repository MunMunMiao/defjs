import { describe, expect, inject, test, vi } from 'vitest'
import type { HttpRequest } from '../../http'
import { ERR_ABORTED, ERR_TIMEOUT } from '../../response'
import { extractHeaders, xhrHandler } from './xhr'

const runtimeTest = typeof XMLHttpRequest === 'function' ? test : test.skip

describe('XHR Handler', () => {
  test('should extract headers', () => {
    const headers = extractHeaders('content-type: application/json\r\nx-custom-header: custom-value')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-custom-header')).toBe('custom-value')
  })

  test('should return empty headers', () => {
    const headers = extractHeaders('')
    expect(Array.from(headers.keys()).length).toBe(0)
  })

  runtimeTest('should create a request', async () => {
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    const body = { id: 1 }
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      body,
      endpoint: '/',
      headers,
      method: 'POST',
      responseType: 'json',
    }
    const response = await xhrHandler(hq)

    expect(response.url).toEqual(new URL(hq.endpoint, hq.baseEndpoint).toString())
    expect(response.body).toEqual(body)
    expect(response.headers.get('Content-Type')).toEqual('application/json')
  })

  runtimeTest('should cancel when timeout', async () => {
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
      queryParams: new URLSearchParams({ ms: '1000' }),
      responseType: 'json',
      timeout: 100,
    }
    const { error } = await xhrHandler(hq)
    expect(error).toBe(ERR_TIMEOUT)
  })

  runtimeTest('should cancel when abort', async () => {
    const abort = new AbortController()
    const hq: HttpRequest = {
      abort: abort.signal,
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
      queryParams: new URLSearchParams({ ms: '1000' }),
      responseType: 'json',
    }

    setTimeout(() => abort.abort(), 100)

    const { error } = await xhrHandler(hq)
    expect(error).toBe(ERR_ABORTED)
  })

  runtimeTest('should cancel when request done', async () => {
    const abort = new AbortController()
    const hq: HttpRequest = {
      abort: abort.signal,
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
      queryParams: new URLSearchParams({ ms: '1000' }),
      responseType: 'json',
    }

    await xhrHandler(hq)

    expect(abort.signal.aborted).toBe(false)
    abort.abort()
    expect(abort.signal.aborted).toBe(true)
  })

  test('should throw error when not supported', async () => {
    vi.stubGlobal('XMLHttpRequest', undefined)

    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)

    vi.unstubAllGlobals()
  })

  runtimeTest('should with withCredentials', async () => {
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/',
      method: 'GET',
      withCredentials: true,
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeUndefined()
  })

  runtimeTest('should set content type header', async () => {
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      body: new ArrayBuffer(0),
      endpoint: '/',
      method: 'GET',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeUndefined()
  })

  runtimeTest('should set accept header', async () => {
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      body: new Blob([], { type: 'image/png' }),
      endpoint: '/',
      headers: new Headers([['Accept', 'image/png']]),
      method: 'GET',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeUndefined()
  })

  runtimeTest('should throw error when unparse body', async () => {
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      body: 'Hello World!',
      endpoint: '/',
      method: 'POST',
      responseType: 'json',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)
  })

  runtimeTest('should throw error when status not ok', async () => {
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/fake',
      method: 'GET',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)
  })

  runtimeTest('should throw when network error', async () => {
    const hq: HttpRequest = {
      baseEndpoint: 'http://localhost:9999',
      endpoint: '/fake',
      method: 'GET',
      responseType: 'json',
    }

    const { error } = await xhrHandler(hq)
    expect(error).toBeInstanceOf(Error)
  })

  runtimeTest('should call progress', async () => {
    let callUploadProgress = false
    let callDownloadProgress = false
    const hq: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      body: new ArrayBuffer(1000),
      downloadProgress: () => {
        callDownloadProgress = true
      },
      endpoint: '/',
      method: 'POST',
      uploadProgress: () => {
        callUploadProgress = true
      },
    }

    await xhrHandler(hq)

    expect(callUploadProgress).toBe(true)
    expect(callDownloadProgress).toBe(true)
  })
})
