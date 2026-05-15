import { describe, expect, test } from 'vitest'
import { makeHttpContext, makeHttpContextToken } from '../internal/context'
import { schema } from '../schema'
import { createHttpRequest, normalizeOutputShape, resolveDefaultResponseType } from './request'

describe('http request helpers', () => {
  test('should create http request with builder helpers params query headers and custom serializer', () => {
    const traceToken = makeHttpContextToken(() => 'default-trace')
    const configContext = makeHttpContext().set(traceToken, 'trace-from-config')
    const abort = new AbortController()

    const request = createHttpRequest(
      'POST',
      '/user/:id',
      {
        id: 7,
        include: true,
        token: 'secret',
      },
      (builder, input) => {
        builder.headers({
          'x-token': input.token,
        })
        builder.pathParams({
          id: input.id,
        })
        builder.queryParams({
          include: input.include,
          tags: ['a', 'b'],
        })
        builder.json({
          nickname: 'Miao',
        })
        builder.withCredentials(false)
      },
      {
        abort: abort.signal,
        baseEndpoint: 'https://api.example.com/v1',
        context: configContext,
        queryParamsSerializer: params => `custom=${params.toString()}`,
        responseType: 'json',
        withCredentials: true,
      },
    )

    expect(request.baseEndpoint).toBe('https://api.example.com/v1')
    expect(request.endpoint).toBe('/user/7')
    expect(request.queryParams?.get('include')).toBe('true')
    expect(request.queryParams?.getAll('tags')).toEqual(['a', 'b'])
    expect(request.queryString).toBe('custom=include=true&tags=a&tags=b')
    expect(request.headers?.get('x-token')).toBe('secret')
    expect(request.headers?.get('content-type')).toBe('application/json')
    expect(request.responseType).toBe('json')
    expect(request.withCredentials).toBe(false)
    expect(request.context?.get(traceToken)).toBe('trace-from-config')
    expect(request.body).toBe('{"nickname":"Miao"}')
  })

  test('should support text xml form-url-encoded and raw body helpers', () => {
    const textRequest = createHttpRequest(
      'POST',
      '/text',
      undefined,
      builder => {
        builder.text('hello')
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(textRequest.body).toBe('hello')
    expect(textRequest.headers?.get('content-type')).toBe('text/plain;charset=UTF-8')

    const xmlRequest = createHttpRequest(
      'POST',
      '/xml',
      undefined,
      builder => {
        builder.xml('<root />', { contentType: 'text/xml;charset=UTF-8' })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(xmlRequest.body).toBe('<root />')
    expect(xmlRequest.headers?.get('content-type')).toBe('text/xml;charset=UTF-8')

    const encodedRequest = createHttpRequest(
      'POST',
      '/form',
      undefined,
      builder => {
        builder.formUrlEncoded({
          ids: [1, 2],
        })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(encodedRequest.body).toBeInstanceOf(URLSearchParams)
    expect((encodedRequest.body as URLSearchParams).toString()).toBe('ids=1&ids=2')
    expect(encodedRequest.headers?.get('content-type')).toBe('application/x-www-form-urlencoded;charset=UTF-8')

    const rawRequest = createHttpRequest(
      'POST',
      '/raw',
      undefined,
      builder => {
        builder.body(new Uint8Array([1, 2, 3]).buffer)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(rawRequest.body).toBeInstanceOf(ArrayBuffer)
    expect(rawRequest.headers?.has('content-type')).toBe(false)
  })

  test('should serialize json scalar values in request.json helper', () => {
    const stringRequest = createHttpRequest(
      'POST',
      '/json-string',
      undefined,
      builder => {
        builder.json('hello')
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    const numberRequest = createHttpRequest(
      'POST',
      '/json-number',
      undefined,
      builder => {
        builder.json(1)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    const booleanRequest = createHttpRequest(
      'POST',
      '/json-boolean',
      undefined,
      builder => {
        builder.json(true)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    const nullRequest = createHttpRequest(
      'POST',
      '/json-null',
      undefined,
      builder => {
        builder.json(null)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(stringRequest.body).toBe('"hello"')
    expect(numberRequest.body).toBe('1')
    expect(booleanRequest.body).toBe('true')
    expect(nullRequest.body).toBe('null')
    expect(stringRequest.headers?.get('content-type')).toBe('application/json')
  })

  test('should build form data bodies and reject unsupported nested values', () => {
    const request = createHttpRequest(
      'POST',
      '/upload',
      undefined,
      builder => {
        builder.formData({
          age: 18,
          avatar: new Blob(['avatar'], { type: 'image/png' }),
          files: [new Blob(['a']), new Blob(['b'])],
          name: 'Miao',
        })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(request.body).toBeInstanceOf(FormData)
    expect(request.headers?.has('content-type')).toBe(false)

    expect(() =>
      createHttpRequest(
        'POST',
        '/upload',
        undefined,
        builder => {
          builder.formData({
            profile: { nested: true } as never,
          })
        },
        {
          abort: new AbortController().signal,
          baseEndpoint: 'https://api.example.com',
          queryParamsSerializer: params => params.toString(),
        },
      ),
    ).toThrowError('request.formData() does not support value for key "profile"')
  })

  test('should reject writing request body more than once', () => {
    expect(() =>
      createHttpRequest(
        'POST',
        '/conflict',
        undefined,
        builder => {
          builder.json({ ok: true })
          builder.text('hello')
        },
        {
          abort: new AbortController().signal,
          baseEndpoint: 'https://api.example.com',
          queryParamsSerializer: params => params.toString(),
        },
      ),
    ).toThrowError('Request body can only be set once')
  })

  test('should resolve default response types from output declarations', () => {
    expect(resolveDefaultResponseType(undefined)).toBeUndefined()
    expect(
      resolveDefaultResponseType({
        200: schema.object({
          ok: schema.boolean(),
        }),
      }),
    ).toBe('json')
    expect(resolveDefaultResponseType(undefined, 'blob')).toBe('blob')
  })

  test('should normalize output shape with single status value', () => {
    const map = normalizeOutputShape([
      { body: schema.string(), status: 200 },
    ])
    expect(map.get(200)).toBeDefined()
  })
})
