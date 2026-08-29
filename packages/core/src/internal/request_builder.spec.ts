import { describe, expect, test } from 'vitest'
import { struct, type AnyStruct } from '../struct'
import { buildRequest, type RequestBuildHandler } from './request_builder'

function unsupportedSseBuild<TInput extends AnyStruct>(build: RequestBuildHandler<TInput>): RequestBuildHandler<TInput, 'sse'> {
  return build as unknown as RequestBuildHandler<TInput, 'sse'>
}

describe('request_builder formUrlEncoded', () => {
  test('formUrlEncoded uses a single URLSearchParams instance(no double allocation)', () => {
    const input = struct.request({
      body: struct.urlencoded({
        a: struct.string(),
        b: struct.string(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1', b: '2' } },
      (request, view) => {
        request.setFormUrlEncoded({ a: view.body.a, b: view.body.b })
      },
      { input },
    )

    expect(built.body).toBeInstanceOf(URLSearchParams)
    const body = built.body as URLSearchParams
    expect(body.get('a')).toBe('1')
    expect(body.get('b')).toBe('2')
    expect(built.bodyContentType).toContain('application/x-www-form-urlencoded')
  })

  test('formUrlEncoded honors custom contentType while keeping single instance', () => {
    const input = struct.request({
      body: struct.urlencoded({
        x: struct.string(),
      }),
    })
    const built = buildRequest(
      { body: { x: 'y' } },
      (request, view) => {
        request.setFormUrlEncoded({ x: view.body.x }, { contentType: 'application/x-www-form-urlencoded; charset=ascii' })
      },
      { input },
    )

    expect((built.body as URLSearchParams).get('x')).toBe('y')
    expect(built.bodyContentType).toBe('application/x-www-form-urlencoded; charset=ascii')
  })
})

describe('request_builder general', () => {
  test('buildRequest returns empty object when build is undefined', () => {
    expect(buildRequest(null, undefined, {})).toEqual({})
  })

  test('json sets body and content type', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          a: struct.number(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { a: 1 } },
      (request, view) => {
        request.setJson({ a: view.body.a })
      },
      { input },
    )
    expect(built.body).toBe('{"a":1}')
    expect(built.bodyContentType).toBe('application/json')
  })

  test('request-shaped json body applies aliases and stringifies exactly once', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          displayName: struct.string().alias('display_name'),
          nested: struct.object({
            traceId: struct.string().alias('trace_id'),
          }),
        }),
      ),
    })

    const built = buildRequest(
      {
        body: {
          displayName: 'Miao',
          nested: { traceId: 'trace-1' },
        },
      },
      undefined,
      { input },
    )

    expect(built.body).toBe('{"display_name":"Miao","nested":{"trace_id":"trace-1"}}')
    expect(JSON.parse(built.body as string)).toEqual({ display_name: 'Miao', nested: { trace_id: 'trace-1' } })
    expect(built.bodyContentType).toBe('application/json')
  })

  test('json with custom content type', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          a: struct.number(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { a: 1 } },
      (request, view) => {
        request.setJson({ a: view.body.a }, { contentType: 'application/vnd+json' })
      },
      { input },
    )
    expect(built.bodyContentType).toBe('application/vnd+json')
  })

  test('struct.json contentType is applied without a custom build', () => {
    const input = struct.request({
      body: struct.json(struct.object({ a: struct.number() }), { contentType: 'application/merge-patch+json' }),
    })
    const built = buildRequest({ body: { a: 1 } }, undefined, { input })
    expect(built.body).toBe('{"a":1}')
    expect(built.bodyContentType).toBe('application/merge-patch+json')
  })

  test('text sets body and content type', () => {
    const input = struct.request({
      body: struct.text(),
    })
    const built = buildRequest(
      { body: 'hello' },
      (request, view) => {
        request.setText(view.body)
      },
      { input },
    )
    expect(built.body).toBe('hello')
    expect(built.bodyContentType).toBe('text/plain;charset=UTF-8')
  })

  test('html sets body and content type', () => {
    const input = struct.request({
      body: struct.text(),
    })
    const built = buildRequest(
      { body: '<div>hello</div>' },
      (request, view) => {
        request.setHtml(view.body)
      },
      { input },
    )
    expect(built.body).toBe('<div>hello</div>')
    expect(built.bodyContentType).toBe('text/html;charset=UTF-8')
  })

  test('xml sets body and content type', () => {
    const input = struct.request({
      body: struct.text(),
    })
    const built = buildRequest(
      { body: '<?xml version="1.0"?>' },
      (request, view) => {
        request.setHtml(view.body)
      },
      { input },
    )
    expect(built.body).toBe('<?xml version="1.0"?>')
    expect(built.bodyContentType).toBe('text/html;charset=UTF-8')
  })

  test('manual html builder remains separate from request-shaped text body defaulting', () => {
    const input = struct.request({ body: struct.text() })

    const defaultBuilt = buildRequest({ body: '<p>plain</p>' }, undefined, { input })
    const htmlBuilt = buildRequest(
      { body: '<p>html</p>' },
      (request, view) => {
        request.setHtml(view.body)
      },
      { input },
    )

    expect(defaultBuilt.body).toBe('<p>plain</p>')
    expect(defaultBuilt.bodyContentType).toBe('text/plain;charset=UTF-8')
    expect(htmlBuilt.body).toBe('<p>html</p>')
    expect(htmlBuilt.bodyContentType).toBe('text/html;charset=UTF-8')
  })

  test('body helpers preserve explicit null content type opt-out', () => {
    const jsonInput = struct.request({
      body: struct.json(struct.object({ a: struct.number() })),
    })
    const textInput = struct.request({
      body: struct.text(),
    })
    const urlencodedInput = struct.request({
      body: struct.urlencoded({ id: struct.number() }),
    })

    const json = buildRequest(
      { body: { a: 1 } },
      (request, view) => {
        request.setJson({ a: view.body.a }, { contentType: null })
      },
      { input: jsonInput },
    )
    const text = buildRequest(
      { body: 'hello' },
      (request, view) => {
        request.setText(view.body, { contentType: null })
      },
      { input: textInput },
    )
    const formUrlEncoded = buildRequest(
      { body: { id: 1 } },
      (request, view) => {
        request.setFormUrlEncoded({ id: view.body.id }, { contentType: null })
      },
      { input: urlencodedInput },
    )

    expect(json.bodyContentType).toBeNull()
    expect(text.bodyContentType).toBeNull()
    expect(formUrlEncoded.bodyContentType).toBeNull()
  })

  test('body helpers use the last write', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          msg: struct.string(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { msg: 'hello' } },
      (request, view) => {
        request.setJson({ msg: view.body.msg })
        request.setText(view.body.msg)
      },
      { input },
    )

    expect(built.body).toBe('hello')
    expect(built.bodyContentType).toBe('text/plain;charset=UTF-8')
  })

  test('headers with plain object', () => {
    const input = struct.request({
      headers: struct.object({
        'x-auth': struct.string(),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-auth': 'token' } },
      (request, view) => {
        request.setHeaders({ 'x-auth': view.headers['x-auth'] })
      },
      { input },
    )
    expect(built.headers?.get('x-auth')).toBe('token')
  })

  test('headers with undefined value', () => {
    const input = struct.request({
      headers: struct.object({
        'x-auth': struct.string().optional(),
        'x-missing': struct.string().optional(),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-auth': 'token' } },
      (request, view) => {
        request.setHeaders({ 'x-auth': view.headers['x-auth'], 'x-missing': view.headers['x-missing'] })
      },
      { input },
    )
    expect(built.headers?.get('x-auth')).toBe('token')
    expect(built.headers?.has('x-missing')).toBe(false)
  })

  test('headers with array value', () => {
    const input = struct.request({
      headers: struct.object({
        'x-tag': struct.array(struct.string()),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-tag': ['a', 'b'] } },
      (request, view) => {
        request.setHeaders({ 'x-tag': view.headers['x-tag'] })
      },
      { input },
    )
    expect(built.headers?.get('x-tag')).toContain('a')
    expect(built.headers?.get('x-tag')).toContain('b')
  })

  test('headers use the last write', () => {
    const input = struct.request({
      headers: struct.object({
        'x-old': struct.string().optional(),
        'x-token': struct.string(),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-old': '1', 'x-token': 'old' } },
      (request, view) => {
        request.setHeaders({ 'x-old': view.headers['x-old'], 'x-token': view.headers['x-token'] })
        request.setHeaders({ 'x-token': view.headers['x-token'] })
      },
      { input },
    )

    expect(built.headers?.has('x-old')).toBe(false)
    expect(built.headers?.get('x-token')).toBe('old')
  })

  test('pathParams use the last write', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.string().optional(),
        name: struct.string().optional(),
      }),
    })
    const built = buildRequest(
      { path: { id: '1' } },
      (request, view) => {
        request.setPathParams({ id: view.path.id })
        request.setPathParams({ name: view.path.name })
      },
      { input },
    )
    expect(built.params).toEqual({ name: undefined })
  })

  test('queryParams use the last write', () => {
    const input = struct.request({
      query: struct.object({
        page: struct.string().optional(),
        size: struct.string().optional(),
      }),
    })
    const built = buildRequest(
      { query: { page: '1' } },
      (request, view) => {
        request.setQueryParams({ page: view.query.page })
        request.setQueryParams({ size: view.query.size })
      },
      { input },
    )
    expect(built.query).toEqual({ size: undefined })
  })

  test('formData with scalar values', () => {
    const input = struct.request({
      body: struct.formData({
        text: struct.string(),
        num: struct.number(),
        bool: struct.boolean(),
        nil: struct.null(),
      }),
    })
    const built = buildRequest(
      { body: { text: 'hello', num: 42, bool: true, nil: null } },
      (request, view) => {
        request.setFormData({
          bool: view.body.bool,
          nil: view.body.nil,
          num: view.body.num,
          text: view.body.text,
        })
      },
      { input },
    )
    expect(built.body).toBeInstanceOf(FormData)
    const form = built.body as FormData
    expect(form.get('text')).toBe('hello')
    expect(form.get('num')).toBe('42')
    expect(form.get('bool')).toBe('true')
    expect(form.get('nil')).toBe('null')
  })

  test('formData with array values', () => {
    const input = struct.request({
      body: struct.formData({
        tags: struct.array(struct.string()),
      }),
    })
    const built = buildRequest(
      { body: { tags: ['a', 'b'] } },
      (request, view) => {
        request.setFormData({ tags: view.body.tags })
      },
      { input },
    )
    const form = built.body as FormData
    expect(form.getAll('tags')).toEqual(['a', 'b'])
  })

  test('formData with undefined value skips key', () => {
    const input = struct.request({
      body: struct.formData({
        a: struct.string(),
        b: struct.string().optional(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1' } },
      (request, view) => {
        request.setFormData({ a: view.body.a, b: view.body.b })
      },
      { input },
    )
    const form = built.body as FormData
    expect(form.has('b')).toBe(false)
  })

  test('formData with Blob value', () => {
    const blob = new Blob(['content'], { type: 'text/plain' })
    const input = struct.request({
      body: struct.formData({
        file: struct.blob(),
      }),
    })
    const built = buildRequest(
      { body: { file: blob } },
      (request, view) => {
        request.setFormData({ file: view.body.file })
      },
      { input },
    )
    const form = built.body as FormData
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  test('formData throws for unsupported value', () => {
    const input = struct.request({
      body: struct.formData({
        obj: struct.object({ nested: struct.boolean() }),
      }),
    })
    expect(() =>
      buildRequest(
        { body: { obj: { nested: true } } },
        (request, view) => {
          request.setFormData({ obj: view.body.obj as never })
        },
        { input },
      ),
    ).toThrow('formData binding does not support nested object for key "obj"')
  })

  test('formUrlEncoded serializes bigint via default String coercion', () => {
    const input = struct.request({
      body: struct.urlencoded({
        id: struct.bigint(),
      }),
    })
    const built = buildRequest(
      { body: { id: 1n } },
      (request, view) => {
        request.setFormUrlEncoded({ id: view.body.id })
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.get('id')).toBe('1')
  })

  test('formUrlEncoded with array values', () => {
    const input = struct.request({
      body: struct.urlencoded({
        tags: struct.array(struct.string()),
      }),
    })
    const built = buildRequest(
      { body: { tags: ['a', 'b'] } },
      (request, view) => {
        request.setFormUrlEncoded({ tags: view.body.tags })
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.getAll('tags')).toEqual(['a', 'b'])
  })

  test('formUrlEncoded with undefined value skips key', () => {
    const input = struct.request({
      body: struct.urlencoded({
        a: struct.string(),
        b: struct.string().optional(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1' } },
      (request, view) => {
        request.setFormUrlEncoded({ a: view.body.a, b: view.body.b })
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.has('b')).toBe(false)
  })

  test('formUrlEncoded with null value', () => {
    const input = struct.request({
      body: struct.urlencoded({
        data: struct.null(),
      }),
    })
    const built = buildRequest(
      { body: { data: null } },
      (request, view) => {
        request.setFormUrlEncoded({ data: view.body.data })
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.get('data')).toBe('null')
  })
})

describe('request_builder request-shaped input', () => {
  test('enforces SSE request build constraints', () => {
    const queryInput = struct.request({ query: struct.object({ id: struct.number() }) })
    expect(buildRequest({ query: { id: 1 } }, undefined, { input: queryInput, transport: 'sse' }).query).toEqual({ id: 1 })

    const bodyInput = struct.request({ body: struct.json(struct.object({ ok: struct.boolean() })) })
    expect(() => buildRequest({ body: { ok: true } }, undefined, { input: bodyInput, transport: 'sse' })).toThrow(
      'SSE request input does not support body section',
    )
    expect(() =>
      buildRequest(
        { body: { ok: true } },
        unsupportedSseBuild<typeof bodyInput>((request, view) => request.setJson({ ok: view.body.ok })),
        { input: bodyInput, transport: 'sse' },
      ),
    ).toThrow('SSE build() does not support request body')
  })

  test('builds request locations and json body from struct.request', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.number(),
      }),
      query: struct.object({
        include: struct.boolean(),
      }),
      headers: struct.object({
        token: struct.string().alias('x-token'),
      }),
      body: struct.json(
        struct.object({
          ignored: struct.string(),
          nickname: struct.string(),
        }),
      ),
    })

    const built = buildRequest(
      {
        body: {
          ignored: 'visible',
          nickname: 'Miao',
        },
        headers: {
          token: 'secret',
        },
        path: {
          id: 7,
        },
        query: {
          include: true,
        },
      },
      undefined,
      { input },
    )

    expect(built.params).toEqual({ id: 7 })
    expect(built.query).toEqual({ include: true })
    expect(built.headers?.get('x-token')).toBe('secret')
    expect(built.bodyContentType).toBe('application/json')
    expect(built.body).toBe('{"ignored":"visible","nickname":"Miao"}')
  })

  test('keeps path-only fields out of request-shaped json body', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
      path: struct.object({
        orgId: struct.string().alias('org_id'),
      }),
    })

    const built = buildRequest(
      {
        body: {
          name: 'Miao',
        },
        path: {
          orgId: 'org_1',
        },
      },
      undefined,
      { input },
    )

    expect(built.params).toEqual({ org_id: 'org_1' })
    expect(built.body).toBe('{"name":"Miao"}')
  })

  test('models same wire key in different request sections', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          orgId: struct.string().alias('org_id'),
        }),
      ),
      path: struct.object({
        orgId: struct.string().alias('org_id'),
      }),
    })

    const built = buildRequest({ body: { orgId: 'body_org' }, path: { orgId: 'path_org' } }, undefined, { input })

    expect(built.params).toEqual({ org_id: 'path_org' })
    expect(built.body).toBe('{"org_id":"body_org"}')
  })

  test('models conflicting wire keys with distinct source fields', () => {
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

    const built = buildRequest(
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
      { input },
    )

    expect(built.params).toEqual({ uid: 7 })
    expect(built.query).toEqual({ name: 'Jack' })
    expect(JSON.parse(built.body as string)).toEqual({ name: 'baby', uid: 1 })
  })

  test('uses aliases independently for request sections', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          traceId: struct.string().alias('x-trace-id'),
        }),
      ),
      query: struct.object({
        includeProfile: struct.boolean().alias('include_profile'),
      }),
    })

    const built = buildRequest(
      {
        body: {
          traceId: 'trace-1',
        },
        query: {
          includeProfile: true,
        },
      },
      undefined,
      { input },
    )

    expect(built.query).toEqual({ include_profile: true })
    expect(JSON.parse(built.body as string)).toEqual({ 'x-trace-id': 'trace-1' })
  })

  test('bound request view rejects duplicate wire keys during keyed materialization', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          firstName: struct.string().alias('name'),
          displayName: struct.string().alias('name'),
        }),
      ),
    })

    expect(() =>
      buildRequest(
        {
          body: {
            firstName: 'Ada',
            displayName: 'Lovelace',
          },
        },
        (request, view) => {
          request.setJson(view.body)
        },
        { input },
      ),
    ).toThrow('duplicate wire key "name"')
  })

  test('does not default-build non-request structs', () => {
    const input = struct.object({
      name: struct.string(),
      orgId: struct.string(),
    })

    const built = buildRequest(
      {
        orgId: 'org_1',
        name: 'Miao',
      },
      undefined,
      { input },
    )

    expect(built).toEqual({})
  })

  test('uses key aliases recursively in request-shaped json bodies', () => {
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
    })

    const built = buildRequest(
      {
        body: {
          profile: {
            displayName: 'Miao',
            internalNote: 'local-only',
          },
        },
      },
      undefined,
      { input },
    )

    expect(built.body).toBe('{"profile":{"display_name":"Miao","internalNote":"local-only"}}')
  })

  test('builds blob body through the same request body descriptor path', () => {
    const input = struct.request({ body: struct.blob() })
    const body = new Blob(['hello'], { type: 'text/plain' })

    const built = buildRequest({ body }, undefined, { input })

    expect(built.body).toBe(body)
    expect(built.bodyContentType).toBe(body.type)
  })

  test('leaves blob body content type undefined when the Blob has no type', () => {
    const input = struct.request({ body: struct.blob() })
    const body = new Blob(['hello'])

    const built = buildRequest({ body }, undefined, { input })

    expect(built.body).toBe(body)
    expect(built.bodyContentType).toBeUndefined()
  })

  test('builds arrayBuffer body through the same request body descriptor path', () => {
    const input = struct.request({ body: struct.arrayBuffer() })
    const body = new ArrayBuffer(4)

    const built = buildRequest({ body }, undefined, { input })

    expect(built.body).toBe(body)
    expect(built.bodyContentType).toBe('application/octet-stream')
  })

  test('distinguishes urlencoded and formData body wrappers', () => {
    const urlencodedInput = struct.request({
      body: struct.urlencoded({
        name: struct.string(),
      }),
    })
    const formDataInput = struct.request({
      body: struct.formData({
        avatar: struct.blob(),
        name: struct.string(),
      }),
    })
    const avatar = new Blob(['avatar'], { type: 'image/png' })

    const urlencoded = buildRequest({ body: { name: 'Miao' } }, undefined, {
      input: urlencodedInput,
    })
    const multipart = buildRequest({ body: { avatar, name: 'Miao' } }, undefined, {
      input: formDataInput,
    })

    expect(urlencoded.body).toBeInstanceOf(URLSearchParams)
    expect((urlencoded.body as URLSearchParams).toString()).toBe('name=Miao')
    expect(urlencoded.bodyContentType).toBe('application/x-www-form-urlencoded;charset=UTF-8')

    expect(multipart.body).toBeInstanceOf(FormData)
    expect(multipart.bodyContentType).toBeUndefined()
    expect((multipart.body as FormData).get('avatar')).toBeInstanceOf(Blob)
    expect(((multipart.body as FormData).get('avatar') as Blob).size).toBe(avatar.size)
    expect((multipart.body as FormData).get('name')).toBe('Miao')
  })

  test('request-shaped urlencoded and formData bodies keep their boundary materializers', () => {
    const urlencodedInput = struct.request({
      body: struct.urlencoded({
        page: struct.number(),
        q: struct.string(),
      }),
    })
    const formDataInput = struct.request({
      body: struct.formData({
        avatar: struct.blob(),
        title: struct.string(),
      }),
    })
    const avatar = new Blob(['avatar'], { type: 'image/png' })

    const urlencoded = buildRequest({ body: { page: 1, q: 'zen kit' } }, undefined, { input: urlencodedInput })
    const multipart = buildRequest({ body: { avatar, title: 'profile' } }, undefined, { input: formDataInput })

    expect(urlencoded.body).toBeInstanceOf(URLSearchParams)
    expect((urlencoded.body as URLSearchParams).toString()).toBe('page=1&q=zen+kit')
    expect(urlencoded.bodyContentType).toBe('application/x-www-form-urlencoded;charset=UTF-8')

    expect(multipart.body).toBeInstanceOf(FormData)
    expect((multipart.body as FormData).get('avatar')).toBeInstanceOf(Blob)
    expect(((multipart.body as FormData).get('avatar') as Blob).size).toBe(avatar.size)
    expect(((multipart.body as FormData).get('avatar') as Blob).type).toBe(avatar.type)
    expect((multipart.body as FormData).get('title')).toBe('profile')
    expect(multipart.bodyContentType).toBeUndefined()
  })

  test('materializes explicit build plan from bound input view', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: struct.object({
            displayName: struct.string().alias('display_name'),
          }),
        }),
      ),
      headers: struct.object({
        traceId: struct.string().alias('x-trace-id'),
      }),
      path: struct.object({
        userId: struct.number(),
      }),
      query: struct.object({
        includeProfile: struct.boolean().alias('include_profile'),
      }),
    })

    const built = buildRequest(
      {
        body: {
          profile: {
            displayName: 'John Doe',
          },
        },
        headers: { traceId: '123' },
        path: { userId: 1 },
        query: { includeProfile: true },
      },
      (ctx, view) => {
        ctx.setPathParams({ id: view.path.userId })
        ctx.setJson({
          data: {
            includeProfile: view.query.includeProfile,
            traceId: view.headers.traceId,
            userId: view.path.userId,
          },
          name: view.body.profile.displayName,
        })
      },
      { input },
    )

    expect(built.params).toEqual({ id: 1 })
    expect(built.body).toBe('{"data":{"includeProfile":true,"traceId":"123","userId":1},"name":"John Doe"}')
  })

  test('does not rewrite explicit JSON object literal keys with source alias', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          displayName: struct.string().alias('display_name'),
        }),
      ),
    })

    const built = buildRequest(
      { body: { displayName: 'Miao' } },
      (ctx, view) => {
        ctx.setJson({ explicit_name: view.body.displayName })
      },
      { input },
    )

    expect(JSON.parse(built.body as string)).toEqual({ explicit_name: 'Miao' })
  })

  test('applies alias recursively for whole-source JSON bound objects', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: struct.object({ displayName: struct.string().alias('display_name') }),
        }),
      ),
    })

    const built = buildRequest(
      { body: { profile: { displayName: 'Miao' } } },
      (ctx, view) => {
        ctx.setJson(view.body)
      },
      { input },
    )

    expect(JSON.parse(built.body as string)).toEqual({
      profile: { display_name: 'Miao' },
    })
  })

  test('keeps explicit query projection keys literal', () => {
    const input = struct.request({ query: struct.object({ includeProfile: struct.boolean().alias('include_profile') }) })
    const built = buildRequest(
      { query: { includeProfile: true } },
      (ctx, view) => {
        ctx.setQueryParams({ include: view.query.includeProfile })
      },
      { input },
    )

    expect(built.query).toEqual({ include: true })
  })

  test('applies alias for whole-source query bound object', () => {
    const input = struct.request({ query: struct.object({ includeProfile: struct.boolean().alias('include_profile') }) })
    const built = buildRequest(
      { query: { includeProfile: true } },
      (ctx, view) => {
        ctx.setQueryParams(view.query)
      },
      { input },
    )

    expect(built.query).toEqual({ include_profile: true })
  })

  test('keeps explicit path projection keys literal', () => {
    const input = struct.request({ path: struct.object({ userId: struct.number().alias('user_id') }) })
    const built = buildRequest(
      { path: { userId: 1 } },
      (ctx, view) => {
        ctx.setPathParams({ id: view.path.userId })
      },
      { input },
    )

    expect(built.params).toEqual({ id: 1 })
  })

  test('applies alias for whole-source path bound object', () => {
    const input = struct.request({ path: struct.object({ userId: struct.number().alias('user_id') }) })
    const built = buildRequest(
      { path: { userId: 1 } },
      (ctx, view) => {
        ctx.setPathParams(view.path)
      },
      { input },
    )

    expect(built.params).toEqual({ user_id: 1 })
  })

  test('keeps explicit header projection keys literal', () => {
    const input = struct.request({ headers: struct.object({ traceId: struct.string().alias('x-trace-id') }) })
    const built = buildRequest(
      { headers: { traceId: 'trace-1' } },
      (ctx, view) => {
        ctx.setHeaders({ trace: view.headers.traceId })
      },
      { input },
    )

    expect(built.headers?.get('trace')).toBe('trace-1')
    expect(built.headers?.has('x-trace-id')).toBe(false)
  })

  test('applies alias for whole-source header bound object', () => {
    const input = struct.request({ headers: struct.object({ traceId: struct.string().alias('x-trace-id') }) })
    const built = buildRequest(
      { headers: { traceId: 'trace-1' } },
      (ctx, view) => {
        ctx.setHeaders(view.headers)
      },
      { input },
    )

    expect(built.headers?.get('x-trace-id')).toBe('trace-1')
    expect(built.headers?.has('traceId')).toBe(false)
  })

  test('typed bind helpers use the last write for each request area', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          firstName: struct.string(),
          lastName: struct.string(),
        }),
      ),
      headers: struct.object({
        firstToken: struct.string(),
        secondToken: struct.string(),
      }),
      path: struct.object({
        firstId: struct.number(),
        secondId: struct.number(),
      }),
      query: struct.object({
        firstPage: struct.number(),
        secondPage: struct.number(),
      }),
    })

    const built = buildRequest(
      {
        body: {
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
        headers: {
          firstToken: 'old-token',
          secondToken: 'new-token',
        },
        path: {
          firstId: 1,
          secondId: 2,
        },
        query: {
          firstPage: 1,
          secondPage: 2,
        },
      },
      (ctx, view) => {
        ctx.setPathParams({ id: view.path.firstId })
        ctx.setPathParams({ id: view.path.secondId })
        ctx.setQueryParams({ page: view.query.firstPage })
        ctx.setQueryParams({ page: view.query.secondPage })
        ctx.setHeaders({ 'x-token': view.headers.firstToken })
        ctx.setHeaders({ 'x-token': view.headers.secondToken })
        ctx.setJson({ name: view.body.firstName })
        ctx.setJson({ name: view.body.lastName })
      },
      { input },
    )

    expect(built.params).toEqual({ id: 2 })
    expect(built.query).toEqual({ page: 2 })
    expect(built.headers?.get('x-token')).toBe('new-token')
    expect(built.body).toBe('{"name":"Lovelace"}')
  })

  test('supports ArrayProjection map in explicit json build plan', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          users: struct.array(
            struct.object({
              id: struct.number(),
              name: struct.string().alias('full_name'),
              password: struct.string(),
            }),
          ),
        }),
      ),
    })

    const built = buildRequest(
      {
        body: {
          users: [
            { id: 1, name: 'Ada', password: 'secret-a' },
            { id: 2, name: 'Grace', password: 'secret-b' },
          ],
        },
      },
      (ctx, view) => {
        ctx.setJson({
          users: view.body.users.map((user) => ({
            id: user.id,
            name: user.name,
          })),
        })
      },
      { input },
    )

    expect(built.body).toBe('{"users":[{"id":1,"name":"Ada"},{"id":2,"name":"Grace"}]}')
  })

  test('rejects literal values in struct build plan', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
    })

    expect(() =>
      buildRequest(
        {
          body: {
            name: 'Miao',
          },
        },
        (ctx) => {
          ctx.setJson({ name: 'literal' } as never)
        },
        { input },
      ),
    ).toThrow('json binding values must come from build input')
  })

  test('rejects nested objects in flat struct build projections', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: struct.object({
            name: struct.string(),
          }),
        }),
      ),
    })

    expect(() =>
      buildRequest(
        {
          body: {
            profile: {
              name: 'Miao',
            },
          },
        },
        (ctx, view) => {
          ctx.setQueryParams({ profile: view.body.profile } as never)
        },
        { input },
      ),
    ).toThrow('query binding does not support nested object for key "profile"')

    expect(() =>
      buildRequest(
        {
          body: {
            profile: {
              name: 'Miao',
            },
          },
        },
        (ctx, view) => {
          ctx.setFormUrlEncoded({ profile: view.body.profile } as never)
        },
        { input },
      ),
    ).toThrow('urlencoded binding does not support nested object for key "profile"')
  })

  test('struct build headers reject raw Headers projections', () => {
    const input = struct.request({
      headers: struct.object({
        token: struct.string(),
      }),
    })

    expect(() =>
      buildRequest(
        { headers: { token: 'secret' } },
        (ctx) => {
          ctx.setHeaders(new Headers({ 'x-token': 'raw' }) as never)
        },
        { input },
      ),
    ).toThrow('headers binding expects an object projection')
  })

  test('rejects build input fields captured from another context', () => {
    const input = struct.request({
      query: struct.object({
        id: struct.number(),
      }),
    })
    let captured: unknown

    buildRequest(
      { query: { id: 1 } },
      (_ctx, view) => {
        captured = view.query.id
      },
      { input },
    )

    expect(() =>
      buildRequest(
        { query: { id: 2 } },
        (ctx) => {
          ctx.setQueryParams({ id: captured } as never)
        },
        { input },
      ),
    ).toThrow('build input binding belongs to a different build context')
  })

  test('rejects array item fields used outside their map projection', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          users: struct.array(
            struct.object({
              id: struct.number(),
            }),
          ),
        }),
      ),
    })
    let leaked: unknown

    expect(() =>
      buildRequest(
        { body: { users: [{ id: 1 }] } },
        (ctx, view) => {
          view.body.users.map((user) => {
            leaked = user.id
            return { id: user.id }
          })
          ctx.setJson({ leaked } as never)
        },
        { input },
      ),
    ).toThrow('ArrayProjection item fields can only be used inside the map() projection')
  })

  test('single body bind helpers reject mismatched field values', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          payload: struct.object({
            name: struct.string(),
          }),
        }),
      ),
    })

    expect(() =>
      buildRequest(
        { body: { payload: { name: 'Miao' } } },
        (ctx, view) => {
          ctx.setBlob(view.body.payload as never)
        },
        { input },
      ),
    ).toThrow('setBlob() expects a Blob field')
  })

  test('FormData body keeps builder orchestration and lets final request drop Content-Type', () => {
    const input = struct.request({
      body: struct.formData({
        name: struct.string(),
      }),
    })

    const headersFirst = buildRequest(
      { body: { name: 'Miao' } },
      (ctx, view) => {
        ctx.setHeaders({ 'content-type': view.body.name })
        ctx.setFormData({ name: view.body.name })
      },
      { input },
    )

    const bodyFirst = buildRequest(
      { body: { name: 'Miao' } },
      (ctx, view) => {
        ctx.setFormData({ name: view.body.name })
        ctx.setHeaders({ 'content-type': view.body.name })
      },
      { input },
    )

    expect(headersFirst.body).toBeInstanceOf(FormData)
    expect(headersFirst.headers?.get('content-type')).toBe('Miao')
    expect(bodyFirst.body).toBeInstanceOf(FormData)
    expect(bodyFirst.headers?.get('content-type')).toBe('Miao')
  })
})

describe('request_builder addXxx', () => {
  test('addHeaders merges into existing headers', () => {
    const input = struct.request({
      headers: struct.object({
        'x-auth': struct.string(),
        'x-trace': struct.string(),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-auth': 'token', 'x-trace': 'id' } },
      (request, view) => {
        request.setHeaders({ 'x-auth': view.headers['x-auth'] })
        request.addHeaders({ 'x-trace': view.headers['x-trace'] })
      },
      { input },
    )
    expect(built.headers?.get('x-auth')).toBe('token')
    expect(built.headers?.get('x-trace')).toBe('id')
  })

  test('addHeaders creates new Headers when none exists', () => {
    const input = struct.request({
      headers: struct.object({
        'x-auth': struct.string(),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-auth': 'token' } },
      (request, view) => {
        request.addHeaders({ 'x-auth': view.headers['x-auth'] })
      },
      { input },
    )
    expect(built.headers?.get('x-auth')).toBe('token')
  })

  test('addHeaders supports array values for multi-value headers', () => {
    const input = struct.request({
      headers: struct.object({
        'x-tag': struct.array(struct.string()),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-tag': ['a', 'b'] } },
      (request, view) => {
        request.addHeaders({ 'x-tag': view.headers['x-tag'] })
      },
      { input },
    )
    expect(built.headers?.get('x-tag')).toContain('a')
    expect(built.headers?.get('x-tag')).toContain('b')
  })

  test('addFormUrlEncoded appends to existing URLSearchParams', () => {
    const input = struct.request({
      body: struct.urlencoded({
        a: struct.string(),
        b: struct.string(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1', b: '2' } },
      (request, view) => {
        request.setFormUrlEncoded({ a: view.body.a })
        request.addFormUrlEncoded({ b: view.body.b })
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.get('a')).toBe('1')
    expect(body.get('b')).toBe('2')
  })

  test('addFormUrlEncoded creates new URLSearchParams when body is different type', () => {
    const input = struct.request({
      body: struct.urlencoded({
        a: struct.string(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1' } },
      (request, view) => {
        request.setJson({ a: view.body.a })
        request.addFormUrlEncoded({ a: view.body.a })
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.get('a')).toBe('1')
  })

  test('addFormData appends to existing FormData', () => {
    const input = struct.request({
      body: struct.formData({
        a: struct.string(),
        b: struct.string(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1', b: '2' } },
      (request, view) => {
        request.setFormData({ a: view.body.a })
        request.addFormData({ b: view.body.b })
      },
      { input },
    )
    const body = built.body as FormData
    expect(body.get('a')).toBe('1')
    expect(body.get('b')).toBe('2')
  })

  test('addFormData creates new FormData when body is different type', () => {
    const input = struct.request({
      body: struct.formData({
        a: struct.string(),
      }),
    })
    const built = buildRequest(
      { body: { a: '1' } },
      (request, view) => {
        request.setJson({ a: view.body.a })
        request.addFormData({ a: view.body.a })
      },
      { input },
    )
    const body = built.body as FormData
    expect(body.get('a')).toBe('1')
  })
})

describe('request_builder edge coverage', () => {
  test('request-shaped text body sets body and content type', () => {
    const input = struct.request({
      body: struct.text(),
    })
    const built = buildRequest({ body: 'hello' }, undefined, { input })
    expect(built.body).toBe('hello')
    expect(built.bodyContentType).toBe('text/plain;charset=UTF-8')
  })

  test('request-shaped blob body sets body', () => {
    const blob = new Blob(['payload'], { type: 'application/octet-stream' })
    const input = struct.request({
      body: struct.blob(),
    })
    const built = buildRequest({ body: blob }, undefined, { input })
    expect(built.body).toBe(blob)
    expect(built.bodyContentType).toBe('application/octet-stream')
  })

  test('request-shaped arrayBuffer body sets body', () => {
    const buffer = new ArrayBuffer(8)
    const input = struct.request({
      body: struct.arrayBuffer(),
    })
    const built = buildRequest({ body: buffer }, undefined, { input })
    expect(built.body).toBe(buffer)
    expect(built.bodyContentType).toBe('application/octet-stream')
  })

  test('passing a bound request body to a flat helper unwraps the body wrapper', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { name: 'Miao' } },
      (request, view) => {
        // Runtime boundary: view.body is a bound source; casting exercises the bound-source materialization path.
        request.setFormUrlEncoded(view.body as never)
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.get('name')).toBe('Miao')
  })

  test('passing a bound request body to setJson unwraps the body wrapper', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { name: 'Miao' } },
      (request, view) => {
        // Runtime boundary: view.body is a bound source; casting exercises json target unwrapping.
        request.setJson(view.body as never)
      },
      { input },
    )
    expect(built.body).toBe('{"name":"Miao"}')
  })

  test('ArrayProjection source that is not an array throws', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          tags: struct.array(struct.string()),
        }),
      ),
    })
    expect(() =>
      buildRequest(
        { body: { tags: 'not-an-array' as never } },
        (request, view) => {
          // Runtime boundary: view.body.tags struct is array but the bound value is not.
          request.setJson({ items: (view.body.tags as unknown as string[]).map((item) => item) } as never)
        },
        { input },
      ),
    ).toThrow('ArrayProjection source must resolve to an array')
  })

  test('array literal projection materializes each item', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          a: struct.string(),
          b: struct.string(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { a: '1', b: '2' } },
      (request, view) => {
        request.setJson({ items: [view.body.a, view.body.b] })
      },
      { input },
    )
    expect(built.body).toBe('{"items":["1","2"]}')
  })

  test('undefined projection values are omitted from json body', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { name: 'Miao' } },
      (request) => {
        // Runtime boundary: explicit undefined projection should be skipped during materialization.
        request.setJson({ missing: undefined } as never)
      },
      { input },
    )
    expect(built.body).toBe('{}')
  })

  test('encodeFlatRecord rejects non-object struct via bound source', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
    })
    expect(() =>
      buildRequest(
        { body: { name: 'Miao' } },
        (request, view) => {
          // Runtime boundary: view.body.name is a scalar bound source, not a flat-record struct.
          request.setFormUrlEncoded(view.body.name as never)
        },
        { input },
      ),
    ).toThrow('urlencoded binding expects an object struct')
  })

  test('encodeFlatRecord rejects non-object value via bound source', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: struct.object({
            name: struct.string(),
          }),
        }),
      ),
    })
    expect(() =>
      buildRequest(
        { body: { profile: 'not-an-object' as never } },
        (request, view) => {
          // Runtime boundary: view.body.profile struct is object but the bound value is not.
          request.setFormUrlEncoded(view.body.profile as never)
        },
        { input },
      ),
    ).toThrow('urlencoded binding expects an object value')
  })

  test('flat bindings reject binary values except for formData', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          file: struct.blob(),
        }),
      ),
    })
    const blob = new Blob(['x'])
    expect(() =>
      buildRequest(
        { body: { file: blob } },
        (request, view) => {
          // Runtime boundary: headers binding does not accept Blob values.
          request.setHeaders({ file: view.body.file } as never)
        },
        { input },
      ),
    ).toThrow('headers binding does not support binary value for key "file"')
  })

  test('setArrayBuffer rejects non-ArrayBuffer field', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          name: struct.string(),
        }),
      ),
    })
    expect(() =>
      buildRequest(
        { body: { name: 'Miao' } },
        (request, view) => {
          request.setArrayBuffer(view.body.name as never)
        },
        { input },
      ),
    ).toThrow('setArrayBuffer() expects an ArrayBuffer field')
  })

  test('setBlob accepts a Blob field', () => {
    const blob = new Blob(['payload'], { type: 'text/plain' })
    const input = struct.request({
      body: struct.json(
        struct.object({
          file: struct.blob(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { file: blob } },
      (request, view) => {
        request.setBlob(view.body.file)
      },
      { input },
    )
    expect(built.body).toBe(blob)
  })

  test('setArrayBuffer accepts an ArrayBuffer field', () => {
    const buffer = new ArrayBuffer(8)
    const input = struct.request({
      body: struct.json(
        struct.object({
          data: struct.arrayBuffer(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { data: buffer } },
      (request, view) => {
        request.setArrayBuffer(view.body.data)
      },
      { input },
    )
    expect(built.body).toBe(buffer)
  })

  test('setText rejects non-string field', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          id: struct.number(),
        }),
      ),
    })
    expect(() =>
      buildRequest(
        { body: { id: 1 } },
        (request, view) => {
          request.setText(view.body.id as never)
        },
        { input },
      ),
    ).toThrow('text body binding expects a string field')
  })

  test('addHeaders skips undefined header values', () => {
    const input = struct.request({
      headers: struct.object({
        'x-auth': struct.string().optional(),
        'x-trace': struct.string(),
      }),
    })
    const built = buildRequest(
      { headers: { 'x-trace': 'id' } },
      (request, view) => {
        request.addHeaders({ 'x-auth': view.headers['x-auth'], 'x-trace': view.headers['x-trace'] })
      },
      { input },
    )
    expect(built.headers?.has('x-auth')).toBe(false)
    expect(built.headers?.get('x-trace')).toBe('id')
  })

  test('request-shaped json body skips missing and undefined fields', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          age: struct.number().optional(),
          name: struct.string().optional(),
        }),
      ),
    })
    const built = buildRequest({ body: { age: undefined } }, undefined, { input })
    expect(built.body).toBe('{}')
  })

  test('bound flat helper skips missing and undefined object fields', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          a: struct.string().optional(),
          b: struct.string().optional(),
        }),
      ),
    })
    const built = buildRequest(
      { body: { b: undefined } },
      (request, view) => {
        request.setFormUrlEncoded(view.body as never)
      },
      { input },
    )
    const body = built.body as URLSearchParams
    expect(body.has('a')).toBe(false)
    expect(body.has('b')).toBe(false)
  })

  test('headers serialize unsupported scalar values via default String coercion', () => {
    const input = struct.request({
      headers: struct.object({
        id: struct.unknown(),
      }),
    })
    const built = buildRequest(
      { headers: { id: 1n as never } },
      (request, view) => {
        request.setHeaders({ id: view.headers.id } as never)
      },
      { input },
    )
    expect(built.headers?.get('id')).toBe('1')
  })

  test('formData throws for unsupported scalar value', () => {
    const input = struct.request({
      body: struct.formData({
        id: struct.unknown(),
      }),
    })
    expect(() =>
      buildRequest(
        { body: { id: 1n } },
        (request, view) => {
          request.setFormData({ id: view.body.id as never })
        },
        { input },
      ),
    ).toThrow('formData binding does not support value for key "id"')
  })

  test('request-shaped build treats non-plain-object input as empty', () => {
    const input = struct.request({})
    const built = buildRequest(null as never, undefined, { input })
    expect(built.params).toBeUndefined()
    expect(built.query).toBeUndefined()
  })

  test('request-shaped build consumes normalized empty optional sections', () => {
    const input = struct.request({
      headers: struct.object({ traceId: struct.string().optional() }),
      path: struct.object({ locale: struct.string().optional() }),
      query: struct.object({ page: struct.number().optional() }),
    })
    const [error, parsed] = struct.parse(input, {})
    if (error) {
      throw error
    }

    const built = buildRequest(parsed, undefined, { input })

    expect(built.params).toEqual({})
    expect(built.query).toEqual({})
    expect(Array.from(built.headers?.entries() ?? [])).toEqual([])
  })

  test('request-shaped text body with undefined falls back to empty string', () => {
    const input = struct.request({ body: struct.text() })
    const built = buildRequest({ body: undefined }, undefined, { input })
    expect(built.body).toBe('')
  })

  test('bound source path stops at scalar intermediate value', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: struct.object({ name: struct.string() }),
        }),
      ),
    })
    const built = buildRequest(
      { body: { profile: 'not-an-object' as never } },
      (request, view) => {
        request.setJson({ name: view.body.profile.name })
      },
      { input },
    )
    expect(built.body).toBe('{}')
  })
})
