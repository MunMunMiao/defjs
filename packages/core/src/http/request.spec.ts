import { describe, expect, test } from 'vitest'
import { struct } from '../struct'
import { createHttpRequest, resolveDefaultResponseType, resolveOutputStruct } from './request'

describe('http request helpers', () => {
  test('should create http request with builder helpers params query headers and custom serializer', () => {
    const abort = new AbortController()

    const input = struct.request({
      body: struct.json(
        struct.object({
          nickname: struct.string(),
        }),
      ),
      headers: struct.object({
        token: struct.string(),
      }),
      path: struct.object({
        id: struct.number(),
      }),
      query: struct.object({
        include: struct.boolean(),
        tags: struct.array(struct.string()),
      }),
    })

    const request = createHttpRequest(
      'POST',
      '/user/:id',
      {
        body: { nickname: 'Miao' },
        headers: { token: 'secret' },
        path: { id: 7 },
        query: { include: true, tags: ['a', 'b'] },
      },
      (builder, input) => {
        builder.setHeaders({
          'x-token': input.headers.token,
        })
        builder.setPathParams({
          id: input.path.id,
        })
        builder.setQueryParams({
          include: input.query.include,
          tags: input.query.tags,
        })
        builder.setJson({
          nickname: input.body.nickname,
        })
      },
      {
        abort: abort.signal,
        baseEndpoint: 'https://api.example.com/v1',
        input,
        operation: 'users.update',
        queryParamsSerializer: (params) => `custom=${params.toString()}`,
        responseType: 'json',
        withCredentials: true,
      },
    )

    expect(request.baseEndpoint).toBe('https://api.example.com/v1')
    expect(request.endpoint).toBe('/user/7')
    expect(request.operation).toBe('users.update')
    expect(request.queryParams?.get('include')).toBe('true')
    expect(request.queryParams?.getAll('tags')).toEqual(['a', 'b'])
    expect(request.queryString).toBe('custom=include=true&tags=a&tags=b')
    expect(request.headers?.get('x-token')).toBe('secret')
    expect(request.headers?.get('content-type')).toBe('application/json')
    expect(request.responseType).toBe('json')
    expect(request.withCredentials).toBe(true)
    expect(request.body).toBe('{"nickname":"Miao"}')
  })

  test('should reject request-shaped missing path params', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.string().optional(),
      }),
    })

    expect(() =>
      createHttpRequest('GET', '/user/:id', { path: {} }, undefined, {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      }),
    ).toThrow('Missing path param: id')
  })

  test('should pass request-shaped query values to custom queryParamsSerializer', () => {
    const input = struct.request({
      query: struct.object({
        filter: struct.array(struct.string()),
        include: struct.boolean(),
      }),
    })

    const request = createHttpRequest('GET', '/search', { query: { filter: ['active'], include: true } }, undefined, {
      abort: new AbortController().signal,
      baseEndpoint: 'https://api.example.com',
      input,
      queryParamsSerializer: (params, rawParams) => {
        expect(params.get('include')).toBe('true')
        return `include=${params.get('include')}&filter=${encodeURIComponent(JSON.stringify(rawParams?.['filter']))}`
      },
    })

    expect(request.queryString).toBe(`include=true&filter=${encodeURIComponent(JSON.stringify(['active']))}`)
  })

  test('should build default request from struct.request shape', () => {
    const profile = struct.object({
      displayName: struct.string().alias('display_name'),
      internalNote: struct.string(),
    })
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: profile.alias('profile'),
        }),
      ),
      path: struct.object({
        orgId: struct.string().alias('org_id'),
      }),
    })

    const request = createHttpRequest(
      'POST',
      '/orgs/:org_id/users',
      {
        body: {
          profile: {
            displayName: 'Miao',
            internalNote: 'local',
          },
        },
        path: {
          orgId: 'org_1',
        },
      },
      undefined,
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.endpoint).toBe('/orgs/org_1/users')
    expect(request.queryString).toBe('')
    expect(request.body).toBe('{"profile":{"display_name":"Miao","internalNote":"local"}}')
    expect(request.headers?.get('content-type')).toBe('application/json')
  })

  test('should model path query and json body conflicts with request sections', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          bodyName: struct.string().alias('name'),
          bodyUid: struct.number().alias('uid'),
        }),
      ),
      path: struct.object({
        pathUid: struct.number().alias('uid'),
      }),
      query: struct.object({
        queryName: struct.string().alias('name'),
      }),
    })

    const request = createHttpRequest(
      'POST',
      '/users/:uid',
      {
        body: {
          bodyName: 'baby',
          bodyUid: 1,
        },
        path: {
          pathUid: 7,
        },
        query: {
          queryName: 'Jack',
        },
      },
      undefined,
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.endpoint).toBe('/users/7')
    expect(request.queryString).toBe('name=Jack')
    expect(JSON.parse(request.body as string)).toEqual({ name: 'baby', uid: 1 })
  })

  test('should support text xml form-url-encoded and raw body helpers', () => {
    const textInput = struct.request({
      body: struct.text(),
    })
    const textRequest = createHttpRequest(
      'POST',
      '/text',
      { body: 'hello' },
      (builder, input) => {
        builder.setText(input.body)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: textInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(textRequest.body).toBe('hello')
    expect(textRequest.headers?.get('content-type')).toBe('text/plain;charset=UTF-8')

    const xmlInput = struct.request({
      body: struct.text(),
    })
    const xmlRequest = createHttpRequest(
      'POST',
      '/xml',
      { body: '<root />' },
      (builder, input) => {
        builder.setText(input.body, { contentType: 'text/xml;charset=UTF-8' })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: xmlInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(xmlRequest.body).toBe('<root />')
    expect(xmlRequest.headers?.get('content-type')).toBe('text/xml;charset=UTF-8')

    const formInput = struct.request({
      body: struct.urlencoded({
        ids: struct.array(struct.number()),
      }),
    })
    const encodedRequest = createHttpRequest(
      'POST',
      '/form',
      { body: { ids: [1, 2] } },
      (builder, input) => {
        builder.setFormUrlEncoded({
          ids: input.body.ids,
        })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: formInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(encodedRequest.body).toBeInstanceOf(URLSearchParams)
    expect((encodedRequest.body as URLSearchParams).toString()).toBe('ids=1&ids=2')
    expect(encodedRequest.headers?.get('content-type')).toBe('application/x-www-form-urlencoded;charset=UTF-8')

    const rawInput = struct.request({
      body: struct.arrayBuffer(),
    })
    const rawRequest = createHttpRequest(
      'POST',
      '/raw',
      { body: new Uint8Array([1, 2, 3]).buffer },
      (builder, input) => {
        builder.setArrayBuffer(input.body)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: rawInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(rawRequest.body).toBeInstanceOf(ArrayBuffer)
    expect(rawRequest.headers?.get('content-type')).toBe('application/octet-stream')
  })

  test('should let final body stage decide Content-Type after headers', () => {
    const jsonInput = struct.request({
      body: struct.json(struct.object({ ok: struct.boolean() })),
      headers: struct.object({ ct: struct.string().optional() }),
    })
    const jsonRequest = createHttpRequest(
      'POST',
      '/json',
      { body: { ok: true }, headers: { ct: 'text/plain' } },
      (builder, input) => {
        builder.setHeaders({ 'content-type': input.headers.ct })
        builder.setJson({ ok: input.body.ok })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: jsonInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const textInput = struct.request({
      body: struct.text(),
      headers: struct.object({ ct: struct.string().optional() }),
    })
    const suppressedRequest = createHttpRequest(
      'POST',
      '/text',
      { body: 'hello', headers: { ct: 'text/plain' } },
      (builder, input) => {
        builder.setHeaders({ 'content-type': input.headers.ct })
        builder.setText(input.body, { contentType: null })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: textInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const formInput = struct.request({
      body: struct.urlencoded({ id: struct.string() }),
    })
    const urlencodedRequest = createHttpRequest(
      'POST',
      '/urlencoded',
      { body: { id: '1' } },
      (builder, input) => {
        builder.setFormUrlEncoded({ id: input.body.id })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: formInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const nullInput = struct.request({
      body: struct.json(struct.null()),
    })
    const nullBodyRequest = createHttpRequest(
      'POST',
      '/raw-null',
      { body: null },
      (builder, input) => {
        builder.setJson(input.body)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: nullInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const noBodyInput = struct.request({
      body: struct.json(struct.string().optional()),
    })
    const noBodyRequest = createHttpRequest(
      'POST',
      '/json-undefined',
      { body: undefined },
      (builder, input) => {
        builder.setJson(input.body)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: noBodyInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(jsonRequest.headers?.get('content-type')).toBe('application/json')
    expect(suppressedRequest.headers?.has('content-type')).toBe(false)
    expect(urlencodedRequest.headers?.get('content-type')).toBe('application/x-www-form-urlencoded;charset=UTF-8')
    expect(nullBodyRequest.body).toBe('null')
    expect(nullBodyRequest.headers?.get('content-type')).toBe('application/json')
    expect(noBodyRequest.body).toBeUndefined()
    expect(noBodyRequest.headers?.has('content-type')).toBe(false)
  })

  test('should serialize json scalar values in request.json helper', () => {
    const stringInput = struct.request({ body: struct.json(struct.string()) })
    const stringRequest = createHttpRequest(
      'POST',
      '/json-string',
      { body: 'hello' },
      (builder, input) => {
        builder.setJson(input.body as never)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: stringInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const numberInput = struct.request({ body: struct.json(struct.number()) })
    const numberRequest = createHttpRequest(
      'POST',
      '/json-number',
      { body: 1 },
      (builder, input) => {
        builder.setJson(input.body as never)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: numberInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const booleanInput = struct.request({ body: struct.json(struct.boolean()) })
    const booleanRequest = createHttpRequest(
      'POST',
      '/json-boolean',
      { body: true },
      (builder, input) => {
        builder.setJson(input.body as never)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: booleanInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    const nullInput = struct.request({ body: struct.json(struct.null()) })
    const nullRequest = createHttpRequest(
      'POST',
      '/json-null',
      { body: null },
      (builder, input) => {
        builder.setJson(input.body as never)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input: nullInput,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(stringRequest.body).toBe('"hello"')
    expect(numberRequest.body).toBe('1')
    expect(booleanRequest.body).toBe('true')
    expect(nullRequest.body).toBe('null')
    expect(stringRequest.headers?.get('content-type')).toBe('application/json')
  })

  test('should build form data bodies and reject unsupported nested values', () => {
    const input = struct.request({
      body: struct.formData({
        age: struct.number(),
        avatar: struct.blob(),
        files: struct.array(struct.blob()),
        name: struct.string(),
      }),
    })
    const request = createHttpRequest(
      'POST',
      '/upload',
      {
        body: {
          age: 18,
          avatar: new Blob(['avatar'], { type: 'image/png' }),
          files: [new Blob(['a']), new Blob(['b'])],
          name: 'Miao',
        },
      },
      (builder, input) => {
        builder.setFormData({
          age: input.body.age,
          avatar: input.body.avatar,
          files: input.body.files,
          name: input.body.name,
        })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.body).toBeInstanceOf(FormData)
    expect(request.headers?.has('content-type')).toBe(false)

    const badInput = struct.request({
      body: struct.formData({
        profile: struct.object({ nested: struct.boolean() }),
      }),
    })
    expect(() =>
      createHttpRequest(
        'POST',
        '/upload',
        { body: { profile: { nested: true } } },
        (builder, input) => {
          builder.setFormData({ profile: input.body.profile as never })
        },
        {
          abort: new AbortController().signal,
          baseEndpoint: 'https://api.example.com',
          input: badInput,
          queryParamsSerializer: (params) => params.toString(),
        },
      ),
    ).toThrowError('formData binding does not support nested object for key "profile"')
  })

  test('should drop Content-Type for FormData body', () => {
    const input = struct.request({
      body: struct.formData({
        name: struct.string(),
      }),
    })
    const request = createHttpRequest(
      'POST',
      '/upload',
      { body: { name: 'Miao' } },
      (builder, input) => {
        builder.setFormData({ name: input.body.name })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.body).toBeInstanceOf(FormData)
    expect(request.headers?.has('content-type')).toBe(false)
  })

  test('should use the last request body write', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          msg: struct.string(),
        }),
      ),
    })
    const request = createHttpRequest(
      'POST',
      '/conflict',
      { body: { msg: 'hello' } },
      (builder, input) => {
        builder.setJson({ msg: input.body.msg })
        builder.setText(input.body.msg)
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://api.example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.body).toBe('hello')
    expect(request.headers?.get('content-type')).toBe('text/plain;charset=UTF-8')
  })

  test('should resolve default response types from output declarations', () => {
    expect(resolveDefaultResponseType(undefined)).toBeUndefined()
    expect(
      resolveDefaultResponseType({
        200: struct.object({
          ok: struct.boolean(),
        }),
      }),
    ).toBe('json')
    expect(resolveDefaultResponseType(undefined, 'blob')).toBe('blob')
  })

  test('should resolve output struct by status', () => {
    expect(resolveOutputStruct({ 200: struct.string() }, 200)).toBeDefined()
    expect(resolveOutputStruct([{ body: struct.string(), status: 200 }], 200)).toBeDefined()
    expect(resolveOutputStruct([{ body: struct.string(), status: [201, 202] }], 202)).toBeDefined()
    expect(resolveOutputStruct([{ body: struct.string(), status: 200 }], 404)).toBeUndefined()
  })

  test('should let later grouped output status override earlier declarations', () => {
    const first = struct.string()
    const second = struct.number()

    expect(
      resolveOutputStruct(
        [
          { body: first, status: [200, 201] },
          { body: second, status: 200 },
        ],
        200,
      ),
    ).toBe(second)
  })
})
