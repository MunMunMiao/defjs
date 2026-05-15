import { describe, expect, test } from 'vitest'
import { struct, tag } from '../struct'
import { buildRequest } from './request_builder'

describe('request_builder formUrlEncoded', () => {
  test('formUrlEncoded uses a single URLSearchParams instance(no double allocation)', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ a: '1', b: '2' })
    })

    expect(built.body).toBeInstanceOf(URLSearchParams)
    const body = built.body as URLSearchParams
    expect(body.get('a')).toBe('1')
    expect(body.get('b')).toBe('2')
    expect(built.bodyContentType).toContain('application/x-www-form-urlencoded')
  })

  test('formUrlEncoded honors custom contentType while keeping single instance', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ x: 'y' }, { contentType: 'application/x-www-form-urlencoded; charset=ascii' })
    })

    expect((built.body as URLSearchParams).get('x')).toBe('y')
    expect(built.bodyContentType).toBe('application/x-www-form-urlencoded; charset=ascii')
  })
})

describe('request_builder general', () => {
  test('buildRequest returns empty object when build is undefined', () => {
    expect(buildRequest(null, undefined)).toEqual({})
  })

  test('json sets body and content type', () => {
    const built = buildRequest(null, request => {
      request.json({ a: 1 })
    })
    expect(built.body).toBe('{"a":1}')
    expect(built.bodyContentType).toBe('application/json')
  })

  test('json with custom content type', () => {
    const built = buildRequest(null, request => {
      request.json({ a: 1 }, { contentType: 'application/vnd+json' })
    })
    expect(built.bodyContentType).toBe('application/vnd+json')
  })

  test('text sets body and content type', () => {
    const built = buildRequest(null, request => {
      request.text('hello')
    })
    expect(built.body).toBe('hello')
    expect(built.bodyContentType).toBe('text/plain;charset=UTF-8')
  })

  test('html sets body and content type', () => {
    const built = buildRequest(null, request => {
      request.html('<div>hello</div>')
    })
    expect(built.body).toBe('<div>hello</div>')
    expect(built.bodyContentType).toBe('text/html;charset=UTF-8')
  })

  test('xml sets body and content type', () => {
    const built = buildRequest(null, request => {
      request.xml('<?xml version="1.0"?>')
    })
    expect(built.body).toBe('<?xml version="1.0"?>')
    expect(built.bodyContentType).toBe('application/xml;charset=UTF-8')
  })

  test('body sets raw body and content type', () => {
    const built = buildRequest(null, request => {
      request.body('raw', { contentType: 'text/csv' })
    })
    expect(built.body).toBe('raw')
    expect(built.bodyContentType).toBe('text/csv')
  })

  test('body without content type', () => {
    const built = buildRequest(null, request => {
      request.body('raw')
    })
    expect(built.bodyContentType).toBeUndefined()
  })

  test('body with null content type', () => {
    const built = buildRequest(null, request => {
      request.body('raw', { contentType: null })
    })
    expect(built.bodyContentType).toBeUndefined()
  })

  test('throws when body is set twice', () => {
    expect(() =>
      buildRequest(null, request => {
        request.json({ a: 1 })
        request.text('hello')
      }),
    ).toThrow('Request body can only be set once')
  })

  test('headers with plain object', () => {
    const built = buildRequest(null, request => {
      request.headers({ 'x-auth': 'token' })
    })
    expect(built.headers?.get('x-auth')).toBe('token')
  })

  test('headers with Headers instance', () => {
    const built = buildRequest(null, request => {
      request.headers(new Headers({ 'x-auth': 'token' }))
    })
    expect(built.headers?.get('x-auth')).toBe('token')
  })

  test('headers with array', () => {
    const built = buildRequest(null, request => {
      request.headers([['x-auth', 'token']])
    })
    expect(built.headers?.get('x-auth')).toBe('token')
  })

  test('headers with undefined value', () => {
    const built = buildRequest(null, request => {
      request.headers({ 'x-auth': 'token', 'x-missing': undefined })
    })
    expect(built.headers?.get('x-auth')).toBe('token')
    expect(built.headers?.has('x-missing')).toBe(false)
  })

  test('headers with array value', () => {
    const built = buildRequest(null, request => {
      request.headers({ 'x-tag': ['a', 'b'] })
    })
    expect(built.headers?.get('x-tag')).toContain('a')
    expect(built.headers?.get('x-tag')).toContain('b')
  })

  test('pathParams merges records', () => {
    const built = buildRequest(null, request => {
      request.pathParams({ id: '1' })
      request.pathParams({ name: 'test' })
    })
    expect(built.params).toEqual({ id: '1', name: 'test' })
  })

  test('queryParams merges records', () => {
    const built = buildRequest(null, request => {
      request.queryParams({ page: '1' })
      request.queryParams({ size: '10' })
    })
    expect(built.query).toEqual({ page: '1', size: '10' })
  })

  test('withCredentials sets value', () => {
    const built = buildRequest(null, request => {
      request.withCredentials(true)
    })
    expect(built.withCredentials).toBe(true)
  })

  test('formData with scalar values', () => {
    const built = buildRequest(null, request => {
      request.formData({ text: 'hello', num: 42, bool: true, nil: null })
    })
    expect(built.body).toBeInstanceOf(FormData)
    const form = built.body as FormData
    expect(form.get('text')).toBe('hello')
    expect(form.get('num')).toBe('42')
    expect(form.get('bool')).toBe('true')
    expect(form.get('nil')).toBe('null')
  })

  test('formData with array values', () => {
    const built = buildRequest(null, request => {
      request.formData({ tags: ['a', 'b'] })
    })
    const form = built.body as FormData
    expect(form.getAll('tags')).toEqual(['a', 'b'])
  })

  test('formData with undefined value skips key', () => {
    const built = buildRequest(null, request => {
      request.formData({ a: '1', b: undefined })
    })
    const form = built.body as FormData
    expect(form.has('b')).toBe(false)
  })

  test('formData with Blob value', () => {
    const blob = new Blob(['content'], { type: 'text/plain' })
    const built = buildRequest(null, request => {
      request.formData({ file: blob })
    })
    const form = built.body as FormData
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  test('formData throws for unsupported value', () => {
    expect(() =>
      buildRequest(null, request => {
        request.formData({ obj: { nested: true } })
      }),
    ).toThrow('does not support value for key "obj"')
  })

  test('formUrlEncoded serializes bigint via default String coercion', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ id: 1n as never })
    })
    const body = built.body as URLSearchParams
    expect(body.get('id')).toBe('1')
  })

  test('formUrlEncoded with array values', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ tags: ['a', 'b'] })
    })
    const body = built.body as URLSearchParams
    expect(body.getAll('tags')).toEqual(['a', 'b'])
  })

  test('formUrlEncoded with undefined value skips key', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ a: '1', b: undefined })
    })
    const body = built.body as URLSearchParams
    expect(body.has('b')).toBe(false)
  })

  test('formUrlEncoded with object value', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ data: { key: 'val' } })
    })
    const body = built.body as URLSearchParams
    expect(body.get('data')).toBe('{"key":"val"}')
  })

  test('formUrlEncoded with null value', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ data: null })
    })
    const body = built.body as URLSearchParams
    expect(body.get('data')).toBe('null')
  })
})

describe('request_builder tagged struct input', () => {
  test('builds request locations and json body from struct tags', () => {
    const input = struct.object({
      id: struct.number().tag(tag.uri('id'), tag.json('id')),
      ignored: struct.string(),
      include: struct.boolean().tag(tag.query('include')),
      nickname: struct.string().tag(tag.json('nickname')),
      token: struct.string().tag(tag.header('x-token')),
    })

    const built = buildRequest(
      {
        id: 7,
        ignored: 'hidden',
        include: true,
        nickname: 'Miao',
        token: 'secret',
      },
      undefined,
      { body: 'json', input },
    )

    expect(built.params).toEqual({ id: 7 })
    expect(built.query).toEqual({ include: true })
    expect(built.headers?.get('x-token')).toBe('secret')
    expect(built.bodyContentType).toBe('application/json')
    expect(built.body).toBe('{"id":7,"nickname":"Miao"}')
  })

  test('distinguishes urlencoded and multipart tagged bodies', () => {
    const profileForm = struct.object({
      avatar: struct.blob().tag(tag.multipart('avatar')),
      name: struct.string().tag(tag.urlencoded('name'), tag.multipart('name')),
    })
    const avatar = new Blob(['avatar'], { type: 'image/png' })

    const urlencoded = buildRequest({ avatar, name: 'Miao' }, undefined, {
      body: 'urlencoded',
      input: profileForm,
    })
    const multipart = buildRequest({ avatar, name: 'Miao' }, undefined, {
      body: 'multipart',
      input: profileForm,
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
})
