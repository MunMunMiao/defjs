import { afterEach, beforeEach, describe, expect, inject, test, vi } from 'vitest'

import { createClient, withEndpoint, withHTTPHandle, withXSRF } from '../client'
import type { Client } from '../client'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('http browser runtime', () => {
  let baseClient: Client

  beforeEach(() => {
    baseClient = createClient(withEndpoint(inject('testServerHost')))
  })

  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'
  })

  test('should resolve request tuples in real browsers', async () => {
    const useGetAccount = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          id: struct.number(),
        }),
      },
      path: '/json',
    })

    const [error, result, response] = (await baseClient.execute(useGetAccount())) as any

    expect(error).toBeNull()
    expect(result).toEqual({ id: 1 })
    expect(response?.ok).toBe(true)
  })

  test('should support fetch download progress hooks in real browsers', async () => {
    const downloadLoaded: number[] = []

    const useCreateAccount = defineRequest({
      build: (request, input) => {
        request.setArrayBuffer(input.body)
      },
      input: struct.request({ body: struct.arrayBuffer() }),
      method: 'POST',
      path: '/',
    })

    const [error, result, response] = (await baseClient.execute(
      useCreateAccount({ body: new Uint8Array(32 * 1024).buffer }),
      {
        onDownloadProgress(event) {
          downloadLoaded.push(event.loaded)
        },
      },
    )) as any

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.ok).toBe(true)
    expect(downloadLoaded.length).toBeGreaterThan(0)
  })

  test('should preserve fetch timeout semantics in request runtime', async () => {
    const useDelay = defineRequest({
      build: (request, input) => {
        request.setQueryParams({ ms: input.query.ms })
      },
      input: struct.request({ query: struct.object({ ms: struct.number() }) }),
      method: 'GET',
      path: '/delay',
    })

    const [error, result, response] = (await baseClient.execute(
      useDelay({ query: { ms: 1000 } }),
      { timeout: 100 },
    )) as any

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (error?.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('TIMEOUT')
  })

  test('should inject xsrf header from document.cookie on same-origin mutating requests', async () => {
    document.cookie = 'XSRF-TOKEN=browser-cookie; path=/'

    const fetchMock = vi.fn(async (request: Request) => {
      expect(request.url).toBe(`${window.location.origin}/xsrf`)
      expect(request.headers.get('X-XSRF-TOKEN')).toBe('browser-cookie')
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    const client = createClient(withEndpoint(window.location.origin), withHTTPHandle(fetchMock), withXSRF())

    const useXsrf = defineRequest({
      method: 'POST',
      path: '/xsrf',
    })

    const [error, result, response] = (await client.execute(useXsrf())) as any

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('should validate xsrf token through real server round-trip', async () => {
    await fetch('/xsrf-token')

    const client = createClient(withEndpoint(window.location.origin), withXSRF())

    const useValidate = defineRequest({
      method: 'POST',
      output: {
        200: struct.object({ ok: struct.boolean() }),
        403: struct.object({ ok: struct.boolean(), reason: struct.string() }),
      },
      path: '/xsrf-validate',
    })

    const [error, result, response] = (await client.execute(useValidate())) as any

    expect(error).toBeNull()
    expect(result).toEqual({ ok: true })
    expect(response?.ok).toBe(true)
    expect(response?.status).toBe(200)
  })

  test('should be rejected by server when xsrf header is missing', async () => {
    await fetch('/xsrf-token')

    const client = createClient(withEndpoint(window.location.origin))

    const useValidate = defineRequest({
      method: 'POST',
      output: {
        200: struct.object({ ok: struct.boolean() }),
        403: struct.object({ ok: struct.boolean(), reason: struct.string() }),
      },
      path: '/xsrf-validate',
    })

    const [error, result, response] = (await client.execute(useValidate())) as any

    expect(error).not.toBeNull()
    expect(result).toBeUndefined()
    expect(response?.ok).toBe(false)
    expect(response?.status).toBe(403)
  })
})
