import { describe, expect, inject, test, vi } from 'vitest'
import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../http'
import { fetchHandler } from './fetch'

describe('Fetch handler responses', () => {
  test('should response is null when responseType is not set', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
    }

    const { body } = await fetchHandler(requestConfig)
    expect(body).toBeNull()
  })

  test('should abort network', async () => {
    const abort = new AbortController()
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
      abort: abort.signal,
      queryParams: new URLSearchParams({ ms: '5000' }),
    }

    setTimeout(() => {
      abort.abort()
    }, 0)

    const { error } = await fetchHandler(requestConfig)
    expect(error).toBe(ERR_ABORTED)
  })

  test('should timeout network', async () => {
    const signal = AbortSignal.timeout(100)
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
      abort: signal,
      queryParams: new URLSearchParams({ ms: '10000' }),
    }

    const { error } = await fetchHandler(requestConfig)
    expect(error).toBe(ERR_TIMEOUT)
  })

  test('should return error when get request set body', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/delay',
      method: 'GET',
      body: 'Hello World!',
    }

    const { error } = await fetchHandler(requestConfig)
    expect(error).toBeInstanceOf(Error)
  })

  test('should parse json text arraybuffer and blob bodies', async () => {
    const jsonRequest: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
      responseType: 'json',
    }
    const textRequest: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
      responseType: 'text',
    }
    const arrayBufferRequest: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
      responseType: 'arraybuffer',
    }
    const blobRequest: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
      responseType: 'blob',
    }

    await expect(fetchHandler(jsonRequest).then((response) => response.body)).resolves.toEqual({ id: 1 })
    await expect(fetchHandler(textRequest).then((response) => response.body)).resolves.toEqual(JSON.stringify({ id: 1 }))
    await expect(fetchHandler(arrayBufferRequest).then((response) => response.body)).resolves.toBeInstanceOf(ArrayBuffer)
    await expect(fetchHandler(blobRequest).then((response) => response.body)).resolves.toBeInstanceOf(Blob)
  })

  test('should use native response methods when download progress is not requested', async () => {
    const response = new Response(JSON.stringify({ id: 1 }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
    const text = vi.spyOn(response, 'text')
    const fetchMock = vi.fn(async () => response)

    const result = await fetchHandler(
      {
        baseEndpoint: 'https://example.com',
        endpoint: '/json',
        method: 'GET',
        responseType: 'json',
      },
      fetchMock as unknown as typeof fetch,
    )

    expect(result.body).toEqual({ id: 1 })
    expect(text).toHaveBeenCalledTimes(1)
  })

  test('should expose http errors when status is not ok', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/500',
      method: 'GET',
      responseType: 'text',
    }

    const { error } = await fetchHandler(requestConfig)
    expect(error).toBeInstanceOf(Error)
  })

  test('should reject when need json but return text', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/text',
      method: 'GET',
      responseType: 'json',
    }

    const response = await fetchHandler(requestConfig)
    expect(response.body).toBeNull()
    expect(response.error).toBeInstanceOf(Error)
  })

  test('should call downloadProgress', async () => {
    let called = false
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
      responseType: 'text',
      downloadProgress: () => {
        called = true
      },
    }

    await fetchHandler(requestConfig)
    expect(called).toBeTruthy()
  })

  test('should parse body throw error', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/',
      method: 'POST',
      responseType: 'json',
      body: 'hello',
    }

    const response = await fetchHandler(requestConfig)
    expect(response.body).toBeNull()
    expect(response.error).toBeInstanceOf(Error)
  })

  test('should keep explicit accept header', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/',
      method: 'POST',
      responseType: 'json',
      headers: new Headers([['Accept', 'application/json']]),
      body: { id: 1 },
    }

    await expect(fetchHandler(requestConfig)).resolves.not.toThrowError()
  })

  test('should keep response body null for head requests', async () => {
    const requestConfig: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/head',
      method: 'HEAD',
    }

    const res = await fetchHandler(requestConfig)
    expect(res.body).toBeNull()
  })
})
