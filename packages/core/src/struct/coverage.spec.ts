import { describe, expect, test } from 'vitest'
import { decodeObjectByAlias, encodeObjectByAlias, mapAliasedObjectFields } from './codec/common'
import { decodeJson, encodeJson } from './codec/json'
import { appendFormData, encodeMultipart } from './codec/multipart'
import { encodeHeaders, encodePathParams, encodeQueryParams } from './codec/query'
import { forEachEncodedWireField, writeRepeated } from './codec/flat'
import { appendSearchParam, encodeUrlencoded, stringifySearchParamScalar } from './codec/urlencoded'
import { encodeValue, matchesDefinition } from './encode'
import { StructError } from './errors'
import { struct as directStruct } from './facade'
import { isStruct } from './guards'
import { struct } from './index'
import { resolveStructFields } from './fields'
import { getStructFields, parseStructTuple as parse, parseStructValue } from './introspection'
import { matchesRuntimeValue } from './match'
import { parseValue } from './parse'
import { DEFAULT_FLAGS, makeStruct } from './runtime'
import { assertStruct, resolveObjectShape } from './shape'
import { DEFINITION, OMIT } from './symbols'
import type { ObjectDefinition, RuntimeStruct, StructDefinition } from './types'
import { describeValue, expectedType } from './utils'

function runtime(value: unknown): RuntimeStruct {
  return value as RuntimeStruct
}

function definition(value: unknown): StructDefinition {
  return runtime(value)[DEFINITION]
}

describe('struct coverage boundary cases', () => {
  test('direct runtime exports stay wired', async () => {
    const testStruct = directStruct.object({ id: directStruct.string() })

    expect(isStruct(testStruct)).toBe(true)
    expect(typeof DEFINITION).toBe('symbol')
    expect(typeof OMIT).toBe('symbol')

    expect(parseValue(runtime(directStruct.string()), 'x', [], 'value')).toEqual({
      ok: true,
      value: 'x',
    })
    expect(encodeJson(testStruct, { id: 'u_1' })).toEqual({ id: 'u_1' })
    expect(decodeJson(testStruct, { id: 'u_1' })).toEqual({ id: 'u_1' })
  })

  test('constructor guards reject invalid enum and object definitions', () => {
    expect(() => struct.enum({} as { [key: string]: never })).toThrow('enum struct requires at least one string or number value')
    expect(() => struct.object(null as never)).toThrow('object struct requires a plain object')
    expect(() => struct.request(null as never)).toThrow('request struct requires a plain object')
    expect(() => struct.request({ path: struct.string() as never })).toThrow('request.path must be an object struct')
    expect(() => struct.request({ query: struct.string() as never })).toThrow('request.query must be an object struct')
    expect(() => struct.request({ headers: struct.string() as never })).toThrow('request.headers must be an object struct')
    expect(() =>
      struct.request({
        body: struct.object({
          id: struct.string(),
        }) as never,
      }),
    ).toThrow('body must use a body wrapper struct')
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

  test('encode non-matching paths and branch matchers are explicit', () => {
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
    expect(() => assertStruct({}, 'value')).toThrow('value must be a struct')

    const objectStruct = runtime(struct.object({ id: struct.string() }))
    const objectDefinition = objectStruct[DEFINITION] as ObjectDefinition
    const first = resolveObjectShape(objectStruct, objectDefinition)
    expect(resolveObjectShape(objectStruct, objectDefinition)).toBe(first)
  })

  test('runtime alias guard rejects non-string names', () => {
    expect(() => struct.string().alias(null as never)).toThrow('alias() requires a string name')
  })

  test('strict parsing keeps no zero-value construction path', () => {
    expect(parseValue(runtime(struct.string()), undefined, [], 'value').ok).toBe(false)
    expect(parseValue(runtime(struct.string().optional()), undefined, [], 'value')).toEqual({ ok: true, value: undefined })
    expect(parseValue(runtime(struct.string().null()), undefined, [], 'value').ok).toBe(false)
    expect(parseValue(runtime(struct.string().nullish()), undefined, [], 'value')).toEqual({ ok: true, value: undefined })

    const [err, value] = parse(struct.intersection(struct.any(), struct.string()), 'plain')
    if (err) {
      throw err
    }
    expect(value).toBe('plain')
  })

  test('alias-aware parsing stays on the single fail-fast parser', () => {
    const User = struct.object({
      profile: struct.object({ displayName: struct.string().alias('display_name') }).alias('user_profile'),
    })
    expect(parseStructValue(User, { user_profile: { display_name: 'Miao' } }, { useAliases: true })).toEqual({
      profile: { displayName: 'Miao' },
    })

    const input = {
      first_wire: 1,
      get second_wire(): string {
        throw new Error('alias parser continued')
      },
    }
    expect(() =>
      parseStructValue(struct.object({ first: struct.string().alias('first_wire'), second: struct.string().alias('second_wire') }), input, {
        useAliases: true,
      }),
    ).toThrow(StructError)

    const Event = struct.discriminatedUnion('type', [
      struct.object({ payload: struct.string().alias('body'), type: struct.literal('a').alias('kind_a') }),
      struct.object({ count: struct.number(), type: struct.literal('b').alias('kind_b') }),
    ])
    expect(parseStructValue(Event, { body: 'hello', kind_a: 'a' }, { useAliases: true })).toEqual({ payload: 'hello', type: 'a' })
    expect(parseStructValue(Event, { body: 'hello', kind_a: 'a', kind_b: 'b' }, { useAliases: true })).toEqual({
      payload: 'hello',
      type: 'a',
    })
  })

  test('request parsing covers section and body branches', () => {
    const request = struct.request({
      body: struct.json(struct.object({ name: struct.string() })),
      headers: struct.object({ token: struct.string().optional() }),
      path: struct.object({ id: struct.number() }),
      query: struct.object({ include: struct.boolean().optional() }),
    })

    expect(parseValue(runtime(struct.string()), null, [], 'value').ok).toBe(false)
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
          headers: {},
          path: { id: 1 },
          query: {},
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
    expect(parseValue(runtime(optionalSectionRequest), {}, [], 'value').ok).toBe(false)
    expect(parseValue(runtime(struct.request({})), {}, [], 'value')).toEqual({ ok: true, value: {} })
    expect(parseValue(runtime(struct.json(struct.string())), 'hello', [], 'value')).toEqual({ ok: true, value: 'hello' })
  })

  test('expectedType covers every runtime definition kind', () => {
    const message = struct.object({ type: struct.literal('message') })
    const structs = [
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

    for (const [struct, expected] of structs) {
      expect(expectedType(definition(struct))).toBe(expected)
    }
  })

  test('describeValue covers human-readable runtime labels', () => {
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

  test('aliased object codec covers skip, non-object, primitive, and nested paths', () => {
    const profile = struct.object({
      internal: struct.string().optional(),
      name: struct.string().alias('full_name'),
      omitted: struct.string().optional().alias('omitted'),
    })

    expect(encodeObjectByAlias(struct.string(), 'x')).toBe('x')
    expect(encodeObjectByAlias(profile, { name: 'Miao', omitted: undefined })).toEqual({ full_name: 'Miao' })
    expect(() => encodeObjectByAlias(profile, 'bad')).toThrow('json encode expects object value')

    const profiles = struct.array(profile)
    expect(encodeObjectByAlias(profiles, [{ name: 'Miao', omitted: undefined }])).toEqual([{ full_name: 'Miao' }])

    expect(decodeObjectByAlias(struct.string(), 'x')).toBe('x')
    expect(decodeObjectByAlias(profile, { full_name: 'Miao' })).toEqual({
      name: 'Miao',
    })
    expect(() => decodeObjectByAlias(profile, 'bad')).toThrow(StructError)

    expect(() => decodeObjectByAlias(struct.array(profile), 'bad')).toThrow(StructError)
    expect(() => decodeObjectByAlias(struct.tuple([profile]), 'bad')).toThrow(StructError)
    expect(decodeObjectByAlias(struct.tuple([profile]), [{ full_name: 'Miao' }])).toEqual([{ name: 'Miao' }])
    expect(() => decodeObjectByAlias(struct.tuple([profile]), [{ full_name: 'Miao' }, { untouched: true }])).toThrow(StructError)
    expect(() => decodeObjectByAlias(struct.record(profile), 'bad')).toThrow(StructError)

    const event = struct.or(
      struct.object({ payload: struct.string().alias('body'), type: struct.literal('message').alias('kind') }),
      struct.object({ count: struct.number().alias('count'), type: struct.literal('count').alias('kind') }),
    )
    expect(() => decodeObjectByAlias(event, 'bad')).toThrow(StructError)

    const discriminated = struct.discriminatedUnion('type', [
      struct.object({ payload: struct.string().alias('body'), type: struct.literal('message').alias('kind') }),
    ])
    expect(() => decodeObjectByAlias(discriminated, { kind: 'unknown' })).toThrow(StructError)
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
      filter: struct.object({ page: struct.number() }).alias('filter'),
      include: struct.boolean().alias('include'),
      missing: struct.string(),
      optional: struct.string().optional().alias('optional'),
      tags: struct.array(struct.string()).alias('tag'),
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
      id: struct.string().alias('id'),
    })
    expect(encodePathParams(pathParams, { id: 'u_1' })).toEqual({ id: 'u_1' })

    const headers = struct.object({
      meta: struct.object({ page: struct.number() }).alias('x-meta'),
    })
    expect(() => encodeHeaders(headers, { meta: { page: 1 } })).toThrow('header value for "x-meta" requires a scalar value')

    expect(() => encodeUrlencoded(struct.string(), {})).toThrow('urlencoded encode expects object struct')
    const form = struct.object({
      internal: struct.string(),
      name: struct.string().alias('name'),
      optional: struct.string().optional().alias('optional'),
    })
    expect(encodeUrlencoded(form, { name: 'Miao', optional: undefined }).toString()).toBe('name=Miao')

    const params = new URLSearchParams()
    appendSearchParam(params, 'skip', undefined)
    expect(params.has('skip')).toBe(false)
    expect(() => appendSearchParam(params, 'bad', { nested: true })).toThrow('urlencoded value for "bad" requires an explicit serializer')
    expect(stringifySearchParamScalar(null)).toBe('null')
  })

  test('guard helpers reject malformed struct metadata', () => {
    expect(isStruct({ [DEFINITION]: null })).toBe(false)
    expect(isStruct({ [DEFINITION]: { flags: { nullable: false, optional: false }, kind: 'not-real' } })).toBe(false)
  })

  test('union flag and alias codecs cover optional and ambiguous encode branches', () => {
    const optional = struct.string().optional()
    expect(matchesDefinition(definition(optional), undefined, runtime(optional))).toBe(true)

    const conflicting = struct.or(
      struct.object({ count: struct.number() }).alias('left'),
      struct.object({ count: struct.number() }).alias('right'),
    )
    expect(() => encodeObjectByAlias(conflicting, { count: 1 })).toThrow(
      'ambiguous union encode: multiple union branches match with different wire output',
    )
  })

  test('field, flat, and discriminator helpers cover remaining branch edges', () => {
    const duplicate = runtime(
      struct.object({
        first: struct.string().alias('same'),
        second: struct.string().alias('same'),
      }),
    )
    const duplicateDefinition = duplicate[DEFINITION] as ObjectDefinition
    const duplicateShape = resolveObjectShape(duplicate, duplicateDefinition)
    expect(resolveObjectShape(duplicate, duplicateDefinition)).toBe(duplicateShape)
    expect(() => getStructFields(duplicate)).toThrow('duplicate wire key "same" for object fields "first" and "second"')

    const pathFields: Array<{ key: string; value: unknown }> = []
    forEachEncodedWireField(
      struct.object({
        keep: struct.string().alias('keep'),
        skip: struct.string().optional().alias('skip'),
      }),
      { keep: 'yes' },
      'path',
      (field) => pathFields.push(field),
    )
    expect(pathFields).toEqual([{ key: 'keep', value: 'yes' }])

    const repeated: unknown[] = []
    writeRepeated('item', ['a', undefined, ['b']], (_key, value) => repeated.push(value))
    expect(repeated).toEqual(['a', 'b'])

    const ambiguous = struct.discriminatedUnion('type', [
      struct.object({ type: struct.literal('a').alias('kind_a') }),
      struct.object({ type: struct.literal('b').alias('kind_b') }),
    ])
    expect(decodeObjectByAlias(ambiguous, { kind_a: 'a', kind_b: 'b' })).toEqual({ type: 'a' })
  })

  test('coverage guards cover defensive branches without changing public semantics', () => {
    const duplicateDefinition = {
      cache: {
        resolvedShape: {
          first: struct.string().alias('same'),
          second: struct.string().alias('same'),
        },
      },
      flags: DEFAULT_FLAGS,
      kind: 'object',
      shape: Object.create(null),
    } as ObjectDefinition
    expect(() => resolveStructFields(runtime(struct.object({})), duplicateDefinition)).toThrow('duplicate wire key "same"')

    const dateWithoutRuntimeGuard = makeStruct({
      expected: 'Date',
      flags: DEFAULT_FLAGS,
      is: (value): value is Date => value instanceof Date,
      kind: 'date',
    })
    expect(matchesRuntimeValue(dateWithoutRuntimeGuard, new Date(0))).toBe(true)
    expect(matchesRuntimeValue(runtime(struct.request({ query: struct.object({}) })), 'not-a-request')).toBe(false)

    const missingDiscriminator = struct.discriminatedUnion('type', [struct.object({ type: struct.literal('text') })])
    expect(matchesRuntimeValue(runtime(missingDiscriminator), {})).toBe(false)
    expect(matchesRuntimeValue(runtime(missingDiscriminator), { type: 'other' })).toBe(false)

    expect(() => mapAliasedObjectFields(runtime(struct.string()), {}, () => undefined)).toThrow('json encode expects object struct')

    const nonObjectDiscriminator = makeStruct({
      discriminator: 'type',
      expected: '"text"',
      flags: DEFAULT_FLAGS,
      kind: 'discriminatedUnion',
      map: new Map([['text', struct.object({ type: struct.literal('text') })]]),
      options: [struct.string() as never],
    })
    expect(() => decodeObjectByAlias(nonObjectDiscriminator, { type: 'text' })).toThrow(StructError)

    const bodyAliasOption = struct.object({ payload: struct.string().alias('body') })
    const rawDiscriminator = makeStruct({
      discriminator: 'type',
      expected: '"text"',
      flags: DEFAULT_FLAGS,
      kind: 'discriminatedUnion',
      map: new Map([['text', bodyAliasOption]]),
      options: [bodyAliasOption],
    })
    expect(() => decodeObjectByAlias(rawDiscriminator, { body: 'hello', type: 'text' })).toThrow(StructError)

    const missingWireDiscriminator = struct.discriminatedUnion('type', [struct.object({ type: struct.literal('text').alias('kind') })])
    expect(() => decodeObjectByAlias(missingWireDiscriminator, { other: 'text' })).toThrow(StructError)
    expect(() => decodeObjectByAlias(missingWireDiscriminator, { kind: undefined })).toThrow(StructError)
    expect(() => decodeObjectByAlias(missingWireDiscriminator, 'not-object')).toThrow(StructError)

    let reads = 0
    const unstableObjectStruct = {
      _struct: undefined,
      get [DEFINITION]() {
        reads += 1
        return {
          flags: DEFAULT_FLAGS,
          kind: reads < 3 ? 'object' : 'string',
        }
      },
    }
    expect(() => decodeObjectByAlias(unstableObjectStruct as never, {})).toThrow()

    const undefinedEncodingString = makeStruct({
      encode: () => undefined,
      expected: 'string',
      flags: DEFAULT_FLAGS,
      is: (value): value is string => typeof value === 'string',
      kind: 'string',
    })
    const encodedUndefinedFields: Array<{ key: string; value: unknown }> = []
    forEachEncodedWireField(struct.object({ value: undefinedEncodingString }), { value: 'drops after child encode' }, 'query', (field) =>
      encodedUndefinedFields.push(field),
    )
    expect(encodedUndefinedFields).toEqual([])
  })
})
