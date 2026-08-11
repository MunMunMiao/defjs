import { describe, expect, test, vi } from 'vitest'
import { defineRequest } from '../http'
import { struct } from '../struct'
import { createHttpClient } from './http_client'
import { withEndpoint, withHTTPHandle, withQueryParamsSerializer } from './option'

describe('HttpClient', () => {
  test('executes HTTP commands with shared client options', async () => {
    const handle = vi.fn(async (input: RequestInfo | URL) => {
      expect(input instanceof Request ? input.url : String(input)).toBe('https://example.test/items?q=zen')
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }) as unknown as typeof fetch
    const request = defineRequest({
      method: 'GET',
      path: '/items',
      input: struct.request({ query: struct.object({ q: struct.string() }) }),
      output: { 200: struct.object({ ok: struct.boolean() }) },
    })
    const client = createHttpClient(
      withEndpoint('https://example.test'),
      withHTTPHandle(handle),
      withQueryParamsSerializer((params) => params.toString()),
    )

    const [error, data, response] = await client.execute(request({ query: { q: 'zen' } }))

    expect(error).toBeNull()
    expect(data).toEqual({ ok: true })
    expect(response?.status).toBe(200)
    expect(handle).toHaveBeenCalledOnce()
  })
})
