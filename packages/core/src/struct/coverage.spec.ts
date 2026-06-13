import { describe, expect, test } from 'vitest'
import { decodeObjectByTag, encodeObjectByTag } from './codec/common'
import { decodeJson, encodeJson } from './codec/json'
import { appendFormData, encodeMultipart } from './codec/multipart'
import { encodeHeaders, encodePathParams, encodeQueryParams } from './codec/query'
import { appendSearchParam, encodeUrlencoded, stringifySearchParamScalar } from './codec/urlencoded'
import { encodeValue, matchesDefinition } from './encode'
import { StructError } from './errors'
import { struct as directStruct } from './facade'
import { isStruct } from './guards'
import { struct } from './index'
import { getFieldTags, getStructFields, parseStructTuple as parse, parseStructValue } from './introspection'
import { buildZeroValue, isFieldRequired, parseValue, safeZeroValue } from './parse'
import { assertSchema, resolveObjectShape } from './shape'
import { DEFINITION, OMIT, TYPES } from './symbols'
import { createTagNamespace, HeaderTag, JsonTag, tag } from './tag'
import type { ObjectDefinition, RuntimeSchema, SchemaDefinition } from './types'
import { cloneValue, describeValue, expectedType } from './utils'

function runtime(value: unknown): RuntimeSchema {
  return value as RuntimeSchema
}

function definition(value: unknown): SchemaDefinition {
  return runtime(value)[DEFINITION]
}

describe('struct coverage boundary cases', () => {
  test('direct runtime exports stay wired', async () => {
    const schema = directStruct.object({ id: directStruct.string() })

    expect(isStruct(schema)).toBe(true)
    expect(typeof DEFINITION).toBe('symbol')
    expect(typeof OMIT).toBe('symbol')
    expect(typeof TYPES).toBe('symbol')

    expect(parseValue(runtime(directStruct.string()), 'x', [], 'value')).toEqual({
      ok: true,
      value: 'x',
    })
    expect(encodeJson(schema, { id: 'u_1' })).toEqual({ id: 'u_1' })
    expect(decodeJson(schema, { id: 'u_1' })).toEqual({ id: 'u_1' })
  })

  test('constructor guards reject invalid enum and object definitions', () => {
    expect(() => struct.enum({} as Record<string, never>)).toThrow('enum schema requires at least one string or number value')
    expect(() => struct.object(null as never)).toThrow('object schema requires a plain object')
    expect(() => struct.request(null as never)).toThrow('request schema requires a plain object')
    expect(() => struct.request({ path: struct.string() as never })).toThrow('request.path must be an object schema')
    expect(() => struct.request({ query: struct.string() as never })).toThrow('request.query must be an object schema')
    expect(() => struct.request({ headers: struct.string() as never })).toThrow('request.headers must be an object schema')
    expect(() =>
      struct.request({
        body: struct.object({
          id: struct.string(),
        }) as never,
      }),
    ).toThrow('body must use a body wrapper schema')
    expect(definition(struct.request({ body: struct.blob() })).kind).toBe('request')
    expect(definition(struct.request({ body: struct.arrayBuffer() })).kind).toBe('request')
    expect(definition(struct.text()).kind).toBe('requestBody')
    expect(definition(struct.urlencoded({ name: struct.string() })).kind).toBe('requestBody')
    expect(definition(struct.formData({ name: struct.string() })).kind).toBe('requestBody')
  })

  test('internal parse tuple returns native struct validation errors', () => {
    const [error] = parse(struct.number(), 'bad')
    expect(error).toBeInstanceOf(StructError)
  })

  test('encode fallback paths and branch matchers are explicit', () => {
    expect(encodeValue(runtime(struct.array(struct.string())), 'not-array')).toBe('not-array')
    expect(encodeValue(runtime(struct.tuple([struct.string()])), 'not-tuple')).toBe('not-tuple')
    expect(encodeValue(runtime(struct.tuple([struct.string()])), ['x', 1])).toEqual(['x', 1])

    const requiredObject = struct.object({
      id: struct.string(),
      nickname: struct.string().optional(),
    })
    expect(matchesDefinition(definition(requiredObject), {}, runtime(requiredObject))).toBe(false)
    expect(matchesDefinition(definition(requiredObject), { id: 'u_1' }, runtime(requiredObject))).toBe(true)
    expect(matchesDefinition(definition(requiredObject), { id: 'u_1' }, runtime(struct.string()))).toBe(true)

    const literalObject = struct.object({ type: struct.literal('message') })
    expect(matchesDefinition(definition(literalObject), { type: 'count' }, runtime(literalObject))).toBe(false)

    const enumObject = struct.object({ status: struct.enum(['draft', 'published']) })
    expect(matchesDefinition(definition(enumObject), { status: 'archived' }, runtime(enumObject))).toBe(false)

    expect(matchesDefinition(definition(struct.record(struct.string())), [], runtime(struct.record(struct.string())))).toBe(false)
    expect(matchesDefinition(definition(struct.enum(['draft', 'published'])), 'draft', runtime(struct.enum(['draft', 'published'])))).toBe(
      true,
    )

    const request = struct.request({
      body: struct.json(struct.object({ name: struct.string() })),
      headers: struct.object({ token: struct.string() }),
      path: struct.object({ id: struct.number() }),
      query: struct.object({ include: struct.boolean() }),
    })
    const requestValue = {
      body: { name: 'Miao' },
      headers: { token: 'secret' },
      path: { id: 1 },
      query: { include: true },
    }
    expect(encodeValue(runtime(request), 'not-object')).toBe('not-object')
    expect(encodeValue(runtime(request), requestValue)).toEqual(requestValue)
    expect(encodeValue(runtime(request), { path: { id: 1 } })).toEqual({ path: { id: 1 } })
    expect(encodeValue(runtime(request), {})).toEqual({})
    expect(encodeValue(runtime(struct.request({})), {})).toEqual({})
    expect(encodeValue(runtime(struct.json(struct.string())), 'hello')).toBe('hello')
    expect(matchesDefinition(definition(request), requestValue, runtime(request))).toBe(true)
    expect(matchesDefinition(definition(struct.json(struct.string())), 'hello', runtime(struct.json(struct.string())))).toBe(true)
  })

  test('error formatting reuses existing tree nodes and root prettify paths', () => {
    const err = new StructError([
      { code: 'custom', expected: 'valid value', message: 'profile failed', path: ['profile'], received: undefined },
      { code: 'custom', expected: 'valid value', message: 'name failed', path: ['profile', 'name'], received: undefined },
    ])

    expect(err.format()).toEqual({
      _errors: [],
      profile: {
        _errors: ['profile failed'],
        name: { _errors: ['name failed'] },
      },
    })
    expect(
      new StructError([{ code: 'custom', expected: 'valid value', message: 'root failed', path: [], received: undefined }]).prettify(),
    ).toBe('× <root>: root failed')
  })

  test('introspection and shape guards reject non-object structs', () => {
    expect(() => getStructFields(struct.string())).toThrow('object struct is required')
    expect(() => parseStructValue(struct.string(), 1)).toThrow(StructError)
    expect(() => assertSchema({}, 'value')).toThrow('value must be a schema')

    const schema = runtime(struct.object({ id: struct.string() }))
    const objectDefinition = schema[DEFINITION] as ObjectDefinition
    const first = resolveObjectShape(schema, objectDefinition)
    expect(resolveObjectShape(schema, objectDefinition)).toBe(first)
  })

  test('runtime tag guard rejects invalid tag options', () => {
    expect(() => struct.string().tag(null as never)).toThrow('tag() requires tag option functions')
  })

  test('zero value helpers cover optional, nullable, any, unknown, and composite schemas', () => {
    expect(isFieldRequired(definition(struct.string()))).toBe(true)
    expect(isFieldRequired(definition(struct.string().optional()))).toBe(false)
    expect(isFieldRequired(definition(struct.string().null()))).toBe(false)

    expect(safeZeroValue(runtime(struct.any()))).toBeUndefined()
    expect(safeZeroValue(runtime(struct.unknown()))).toBeUndefined()
    expect(safeZeroValue(runtime(struct.string().optional()))).toBeUndefined()
    expect(safeZeroValue(runtime(struct.string().null()))).toBeNull()
    expect(buildZeroValue(runtime(struct.or(struct.string().optional(), struct.number())), [])).toBeUndefined()
    expect(
      buildZeroValue(
        runtime(
          struct.discriminatedUnion('type', [
            struct.object({
              payload: struct.string().optional(),
              type: struct.literal('message'),
            }),
          ]),
        ),
        [],
      ),
    ).toEqual({ type: 'message' })

    const request = struct.request({
      body: struct.json(struct.object({ name: struct.string() })),
      headers: struct.object({ token: struct.string().optional() }),
      path: struct.object({ id: struct.number() }),
      query: struct.object({ include: struct.boolean().optional() }),
    })
    expect(buildZeroValue(runtime(request), [])).toEqual({
      body: { name: '' },
      headers: {},
      path: { id: 0 },
      query: {},
    })
    expect(buildZeroValue(runtime(struct.json(struct.string())), [])).toBe('')

    // intersection zero value: both sides are plain objects → merged
    expect(
      buildZeroValue(runtime(struct.intersection(struct.object({ a: struct.string() }), struct.object({ b: struct.number() }))), []),
    ).toEqual({
      a: '',
      b: 0,
    })
    // intersection zero value: one side is not plain object → right side wins
    expect(buildZeroValue(runtime(struct.intersection(struct.string(), struct.number())), [])).toBe(0)

    const [err, value] = parse(struct.intersection(struct.any(), struct.string()), 'plain')
    if (err) {
      throw err
    }
    expect(value).toBe('plain')
  })

  test('request parsing covers section and body branches', () => {
    const request = struct.request({
      body: struct.json(struct.object({ name: struct.string() })),
      headers: struct.object({ token: struct.string().optional() }),
      path: struct.object({ id: struct.number() }),
      query: struct.object({ include: struct.boolean().optional() }),
    })

    expect(parseValue(runtime(struct.string()), null, [], 'value')).toEqual({ ok: true, value: '' })
    expect(parseValue(runtime(struct.enum(['draft', 'published'])), 'draft', [], 'value')).toEqual({ ok: true, value: 'draft' })
    expect(parseValue(runtime(struct.enum(['draft', 'published'])), 'archived', [], 'value').ok).toBe(false)
    expect(parseValue(runtime(request), 'bad', [], 'value').ok).toBe(false)
    expect(parseValue(runtime(struct.record(struct.string().optional())), { skip: undefined }, [], 'value')).toEqual({
      ok: true,
      value: {},
    })
    expect(
      parseValue(
        runtime(request),
        {
          body: { name: 'Miao' },
          path: { id: 1 },
        },
        [],
        'value',
      ),
    ).toEqual({
      ok: true,
      value: {
        body: { name: 'Miao' },
        headers: {},
        path: { id: 1 },
        query: {},
      },
    })
    expect(
      parseValue(
        runtime(request),
        {
          path: { id: 'bad' },
        },
        [],
        'value',
      ).ok,
    ).toBe(false)
    const optionalSectionRequest = struct.request({
      query: struct.object({ include: struct.boolean() }).optional() as never,
    })
    expect(parseValue(runtime(optionalSectionRequest), {}, [], 'value')).toEqual({ ok: true, value: {} })
    expect(buildZeroValue(runtime(optionalSectionRequest), [])).toEqual({})
    expect(parseValue(runtime(struct.request({})), {}, [], 'value')).toEqual({ ok: true, value: {} })
    expect(buildZeroValue(runtime(struct.request({})), [])).toEqual({})
    expect(parseValue(runtime(struct.json(struct.string())), 'hello', [], 'value')).toEqual({ ok: true, value: 'hello' })
  })

  test('expectedType covers every runtime definition kind', () => {
    const message = struct.object({ type: struct.literal('message') })
    const schemas = [
      [struct.any(), 'any'],
      [struct.array(struct.string()), 'array<string>'],
      [struct.arrayBuffer(), 'ArrayBuffer'],
      [struct.blob(), 'Blob'],
      [struct.bigint(), 'bigint'],
      [struct.boolean(), 'boolean'],
      [struct.date(), 'Date'],
      [struct.file(), 'File'],
      [struct.null(), 'null'],
      [struct.number(), 'number'],
      [struct.string(), 'string'],
      [struct.enum(['draft', 'published']), '"draft" | "published"'],
      [struct.literal('ok'), '"ok"'],
      [struct.intersection(struct.string(), struct.number()), 'string & number'],
      [struct.object({ id: struct.string() }), 'object'],
      [struct.or(struct.string(), struct.number()), 'string | number'],
      [struct.discriminatedUnion('type', [message]), '"message"'],
      [struct.record(struct.string()), 'record<string>'],
      [struct.request({ path: struct.object({ id: struct.string() }) }), 'request'],
      [struct.json(struct.object({ id: struct.string() })), 'json body'],
      [struct.tuple([struct.string()]), 'tuple'],
      [struct.unknown(), 'unknown'],
    ] as const

    for (const [schema, expected] of schemas) {
      expect(expectedType(definition(schema))).toBe(expected)
    }
  })

  test('cloneValue fallback and describeValue cover non-structuredClone paths', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone')
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(cloneValue(null)).toBeNull()
      expect(cloneValue(undefined)).toBeUndefined()
      expect(cloneValue([1, { nested: true }])).toEqual([1, { nested: true }])

      const date = new Date('2026-05-12T10:00:00Z')
      const clonedDate = cloneValue(date)
      expect(clonedDate).not.toBe(date)
      expect(clonedDate).toEqual(date)

      const buffer = new ArrayBuffer(2)
      const clonedBuffer = cloneValue(buffer)
      expect(clonedBuffer).not.toBe(buffer)
      expect(clonedBuffer.byteLength).toBe(2)

      const clonedObject = cloneValue({ value: { nested: true } })
      expect(Object.getPrototypeOf(clonedObject)).toBeNull()
      expect(clonedObject).toEqual({ value: { nested: true } })
      expect(cloneValue(7)).toBe(7)
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'structuredClone', descriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'structuredClone')
      }
    }

    expect(describeValue(null)).toBe('null')
    expect(describeValue(undefined)).toBe('undefined')
    expect(describeValue('x')).toBe('"x"')
    expect(describeValue(true)).toBe('true')
    expect(describeValue(new File(['x'], 'avatar.png'))).toBe('File(avatar.png)')
    expect(describeValue(new Blob(['x']))).toBe('Blob(application/octet-stream)')
    expect(describeValue(new ArrayBuffer(3))).toBe('ArrayBuffer(3)')
    expect(describeValue([])).toBe('array')
    expect(describeValue({})).toBe('object')
    expect(describeValue(Symbol('s'))).toBe('[object Symbol]')
  })

  test('tagged object codec covers skip, non-object, primitive, and nested paths', () => {
    const profile = struct.object({
      internal: struct.string(),
      name: struct.string().tag(tag.json('full_name')),
      omitted: struct.string().tag(tag.json('omitted')),
    })

    expect(encodeObjectByTag(struct.string(), 'x', JsonTag)).toBe('x')
    expect(encodeObjectByTag(profile, { name: 'Miao', omitted: undefined }, JsonTag)).toEqual({ full_name: 'Miao' })
    expect(() => encodeObjectByTag(profile, 'bad', JsonTag)).toThrow('json encode expects object value')

    const profiles = struct.array(profile)
    expect(encodeObjectByTag(profiles, [{ name: 'Miao', omitted: undefined }], JsonTag)).toEqual([{ full_name: 'Miao' }])

    expect(decodeObjectByTag(struct.string(), 'x', JsonTag)).toBe('x')
    expect(decodeObjectByTag(profile, { full_name: 'Miao' }, JsonTag)).toEqual({
      internal: '',
      name: 'Miao',
      omitted: '',
    })
    expect(() => decodeObjectByTag(profile, 'bad', JsonTag)).toThrow('json decode expects object value')

    expect(() => decodeObjectByTag(struct.array(profile), 'bad', JsonTag)).toThrow(StructError)
    expect(() => decodeObjectByTag(struct.tuple([profile]), 'bad', JsonTag)).toThrow(StructError)
    expect(decodeObjectByTag(struct.tuple([profile]), [{ full_name: 'Miao' }, { untouched: true }], JsonTag)).toEqual([
      { internal: '', name: 'Miao', omitted: '' },
    ])
    expect(() => decodeObjectByTag(struct.record(profile), 'bad', JsonTag)).toThrow(StructError)

    const event = struct.or(
      struct.object({ payload: struct.string().tag(tag.json('body')), type: struct.literal('message').tag(tag.json('kind')) }),
      struct.object({ count: struct.number().tag(tag.json('count')), type: struct.literal('count').tag(tag.json('kind')) }),
    )
    expect(() => decodeObjectByTag(event, 'bad', JsonTag)).toThrow(StructError)

    const discriminated = struct.discriminatedUnion('type', [
      struct.object({ payload: struct.string().tag(tag.json('body')), type: struct.literal('message').tag(tag.json('kind')) }),
    ])
    expect(() => decodeObjectByTag(discriminated, { kind: 'unknown' }, JsonTag)).toThrow(StructError)
  })

  test('multipart codec rejects invalid shapes and supports explicit append branches', () => {
    expect(() => encodeMultipart(struct.string(), {})).toThrow('multipart encode expects object struct')

    const form = new FormData()
    appendFormData(form, 'skip', undefined)
    expect(form.get('skip')).toBeNull()

    appendFormData(form, 'item', ['a', 'b'])
    expect(form.getAll('item')).toEqual(['a', 'b'])
    expect(() => appendFormData(form, 'bad', { nested: true })).toThrow('multipart value for "bad" requires a scalar, Blob, or File')
  })

  test('query, header, path, and urlencoded codecs cover scalar and complex branches', () => {
    const query = struct.object({
      filter: struct.object({ page: struct.number() }).tag(tag.query('filter')),
      include: struct.boolean().tag(tag.query('include')),
      missing: struct.string(),
      optional: struct.string().optional().tag(tag.query('optional')),
      tags: struct.array(struct.string()).tag(tag.query('tag')),
    })

    expect(() => encodeQueryParams(struct.string(), {})).toThrow('query encode expects object struct')
    expect(encodeQueryParams(query, { filter: { page: 1 }, include: true, tags: ['a', 'b'] }, { allowComplex: true })).toEqual({
      filter: { page: 1 },
      include: true,
      tag: ['a', 'b'],
    })
    expect(encodeQueryParams(query, { filter: undefined, include: true, optional: undefined, tags: ['a'] })).toEqual({
      include: true,
      tag: ['a'],
    })
    expect(() => encodeQueryParams(query, { filter: { page: 1 }, include: true, tags: ['a'] })).toThrow(
      'query value for "filter" requires queryParamsSerializer or a scalar value',
    )

    const pathParams = struct.object({
      id: struct.string().tag(tag.uri('id')),
    })
    expect(encodePathParams(pathParams, { id: 'u_1' })).toEqual({ id: 'u_1' })

    const headers = struct.object({
      meta: struct.object({ page: struct.number() }).tag(tag.header('x-meta')),
    })
    expect(() => encodeHeaders(headers, { meta: { page: 1 } })).toThrow('header value for "x-meta" requires a scalar value')

    expect(() => encodeUrlencoded(struct.string(), {})).toThrow('urlencoded encode expects object struct')
    const form = struct.object({
      internal: struct.string(),
      name: struct.string().tag(tag.urlencoded('name')),
      optional: struct.string().optional().tag(tag.urlencoded('optional')),
    })
    expect(encodeUrlencoded(form, { name: 'Miao', optional: undefined }).toString()).toBe('name=Miao')

    const params = new URLSearchParams()
    appendSearchParam(params, 'skip', undefined)
    expect(params.has('skip')).toBe(false)
    expect(() => appendSearchParam(params, 'bad', { nested: true })).toThrow('urlencoded value for "bad" requires an explicit serializer')
    expect(stringifySearchParamScalar(null)).toBe('null')
  })

  test('custom tag namespace guards reject invalid names and config keys', () => {
    expect(() => createTagNamespace('1bad')).toThrow('invalid tag namespace name: 1bad')
    expect(() => getFieldTags(struct.string().tag(tag.defineConfig(HeaderTag)('bad key')), 'id')).toThrow(
      'invalid header tag config key: bad key',
    )
  })
})
