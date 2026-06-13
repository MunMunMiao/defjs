import { describe, expect, test } from 'vitest'
import { struct, tag } from '../struct'
import { buildRequest } from './request_builder'

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
  test('builds request locations and json body from struct.request', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.number(),
      }),
      query: struct.object({
        include: struct.boolean(),
      }),
      headers: struct.object({
        token: struct.string().tag(tag.header('x-token')),
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
        orgId: struct.string().tag(tag.uri('org_id')),
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
          orgId: struct.string().tag(tag.json('org_id')),
        }),
      ),
      path: struct.object({
        orgId: struct.string().tag(tag.uri('org_id')),
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
          bodyName: struct.string().tag(tag.json('name')),
          bodyUid: struct.number().tag(tag.json('uid')),
        }),
      ),
      path: struct.object({
        pathUid: struct.number().tag(tag.uri('uid')),
      }),
      query: struct.object({
        queryName: struct.string().tag(tag.query('name')),
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

  test('only consumes tag namespace for the current request section', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          traceId: struct.string().tag(tag.header('x-trace-id')),
        }),
      ),
      query: struct.object({
        includeProfile: struct.boolean().tag(tag.json('include_profile')),
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

    expect(built.query).toEqual({ includeProfile: true })
    expect(JSON.parse(built.body as string)).toEqual({ traceId: 'trace-1' })
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
      displayName: struct.string().tag(tag.json('display_name')),
      internalNote: struct.string(),
    })
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: profile.tag(tag.json('profile')),
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

  test('materializes explicit build plan from bound input view', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          profile: struct.object({
            displayName: struct.string().tag(tag.json('display_name')),
          }),
        }),
      ),
      headers: struct.object({
        traceId: struct.string().tag(tag.header('x-trace-id')),
      }),
      path: struct.object({
        userId: struct.number(),
      }),
      query: struct.object({
        includeProfile: struct.boolean().tag(tag.query('include_profile')),
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
              name: struct.string().tag(tag.json('full_name')),
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

  test('rejects literal values in schema build plan', () => {
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

  test('rejects nested objects in flat schema build projections', () => {
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

  test('schema build headers reject raw Headers projections', () => {
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
