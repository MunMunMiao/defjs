import { describe, expect, test } from 'vitest'
import { createClient, withEndpoint, withHTTPHandle, withInterceptors } from '../client'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('request http response type declarations', () => {
  test('should support explicit responseType declarations', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async ({ endpoint }) => {
          switch (endpoint) {
            case '/json-text':
              return makeResponse({
                body: { id: 1 },
                headers: new Headers([['content-type', 'application/json']]),
                status: 200,
              })
            case '/plain-text':
              return makeResponse({
                body: 'zen-kit',
                headers: new Headers([['content-type', 'text/plain']]),
                status: 200,
              })
            default:
              return makeResponse({
                body: null,
                status: 404,
              })
          }
        }),
      ),
    )

    const useJsonResponse = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          id: struct.number(),
        }),
      },
      responseType: 'json',
      path: '/json-text',
    })

    const useTextResponse = defineRequest({
      method: 'GET',
      output: {
        200: struct.string(),
      },
      responseType: 'text',
      path: '/plain-text',
    })

    const [[jsonError, jsonResult], [textError, textResult]] = await Promise.all([
      client.execute(useJsonResponse()),
      client.execute(useTextResponse()),
    ])

    expect(jsonError).toBeNull()
    expect(jsonResult).toEqual({ id: 1 })
    expect(textError).toBeNull()
    expect(textResult).toBe('zen-kit')
  })

  test.each(['arraybuffer', 'blob'] as const)('should decode a declared JSON 404 when success responseType is %s', async (responseType) => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withHTTPHandle(async (input) => {
        const href = input instanceof Request ? input.url : String(input)
        if (new URL(href).pathname === '/missing') {
          return new Response(JSON.stringify({ message: 'gone' }), {
            headers: { 'content-type': 'application/json' },
            status: 404,
          })
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'application/octet-stream' },
          status: 200,
        })
      }),
    )
    const useMissing = defineRequest({
      method: 'GET',
      output: {
        200: responseType === 'blob' ? struct.blob() : struct.arrayBuffer(),
        404: struct.object({ message: struct.string() }),
      },
      path: '/missing',
      responseType,
    })
    const useOk = defineRequest({
      method: 'GET',
      output: {
        200: responseType === 'blob' ? struct.blob() : struct.arrayBuffer(),
        404: struct.object({ message: struct.string() }),
      },
      path: '/ok',
      responseType,
    })

    const [error, result] = await client.execute(useMissing())
    const [okError, okResult] = await client.execute(useOk())

    expect(result).toBeUndefined()
    expect(error?.kind).toBe('http')
    if (error?.kind !== 'http') {
      throw new Error('Expected http error')
    }
    expect(typeof error.data.message).toBe('string')
    expect(error.data.message).toBe('gone')
    expect(okError).toBeNull()
    if (responseType === 'blob') {
      expect(okResult).toBeInstanceOf(Blob)
    } else {
      expect(okResult).toBeInstanceOf(ArrayBuffer)
    }
  })

  test('should decode JSON error bodies from text, bytes, and blobs', async () => {
    const payloads = [
      JSON.stringify({ message: 'string-body' }),
      new TextEncoder().encode(JSON.stringify({ message: 'view-body' })),
      new Blob([JSON.stringify({ message: 'blob-body' })], { type: 'application/json' }),
    ]
    let index = 0
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () => {
          const body = payloads[index]
          index += 1
          if (body === undefined) {
            throw new Error('missing payload')
          }
          return makeResponse({
            body,
            status: 404,
          })
        }),
      ),
    )
    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.arrayBuffer(),
        404: struct.object({ message: struct.string() }),
      },
      path: '/missing',
      responseType: 'arraybuffer',
    })

    const messages = []
    for (let i = 0; i < payloads.length; i += 1) {
      const [error] = await client.execute(useRequest())
      expect(error?.kind).toBe('http')
      if (error?.kind !== 'http') {
        throw new Error('Expected http error')
      }
      messages.push(error.data.message)
    }

    expect(messages).toEqual(['string-body', 'view-body', 'blob-body'])
  })

  test('should decode a declared text 404 when success responseType is arraybuffer', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withHTTPHandle(async () => new Response('missing', { status: 404 })),
    )
    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.arrayBuffer(),
        404: struct.string(),
      },
      path: '/missing',
      responseType: 'arraybuffer',
    })

    const [error] = await client.execute(useRequest())
    expect(error?.kind).toBe('http')
    if (error?.kind !== 'http') {
      throw new Error('Expected http error')
    }
    expect(error.data).toBe('missing')
  })

  test('should keep declared blob and file error bodies off the JSON path', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withHTTPHandle(async () => new Response(new Uint8Array([1, 2, 3]), { status: 404 })),
    )
    const useBlob = defineRequest({
      method: 'GET',
      output: { 200: struct.arrayBuffer(), 404: struct.blob() },
      path: '/missing-blob',
      responseType: 'arraybuffer',
    })
    const useFile = defineRequest({
      method: 'GET',
      output: { 200: struct.arrayBuffer(), 404: struct.file() },
      path: '/missing-file',
      responseType: 'arraybuffer',
    })

    const [blobError] = await client.execute(useBlob())
    const [fileError] = await client.execute(useFile())

    expect(blobError?.kind).toBe('definition')
    expect(fileError?.kind).toBe('definition')
  })

  test('should keep a declared arraybuffer error body off the JSON decode path', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(createHttpInterceptor(async () => makeResponse({ body: { message: 'gone' }, status: 404 }))),
    )
    const useRequest = defineRequest({
      method: 'GET',
      output: { 200: struct.object({ ok: struct.boolean() }), 404: struct.arrayBuffer() },
      path: '/missing-bytes',
      responseType: 'json',
    })

    const [error] = await client.execute(useRequest())
    expect(error?.kind).toBe('definition')
  })

  test('should parse a declared text error from a non-binary interceptor body', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(createHttpInterceptor(async () => makeResponse({ body: 404, status: 404 }))),
    )
    const useRequest = defineRequest({
      method: 'GET',
      output: {
        200: struct.arrayBuffer(),
        404: struct.string(),
      },
      path: '/missing',
      responseType: 'arraybuffer',
    })

    const [error] = await client.execute(useRequest())
    expect(error?.kind).toBe('definition')
  })
})
