import { afterEach, describe, expect, test, vi } from 'vitest'

import { isSchema, schema, SchemaError } from './index'
import { _any } from './any'
import { _array } from './array'
import { _arrayBuffer } from './arraybuffer'
import { _blob } from './blob'
import { _boolean } from './boolean'
import { _enum } from './enum'
import { _file } from './file'
import { _literal } from './literal'
import { _null } from './null'
import { _number } from './number'
import { _object } from './object'
import { _or } from './or'
import { _record } from './record'
import {
  createArraySchema,
  createObjectEnumSchema,
  createObjectSchema,
  createTupleSchema,
  createUnionSchema,
} from './schema'
import { _string } from './string'
import { _tuple } from './tuple'
import { _unknown } from './unknown'

const originalStructuredClone = globalThis.structuredClone

afterEach(() => {
  globalThis.structuredClone = originalStructuredClone
  vi.restoreAllMocks()
})

describe('schema', () => {
  test('exports every constructor from namespace', () => {
    expect(schema.string).toBe(_string)
    expect(schema.number).toBe(_number)
    expect(schema.boolean).toBe(_boolean)
    expect(schema.null).toBe(_null)
    expect(schema.any).toBe(_any)
    expect(schema.unknown).toBe(_unknown)
    expect(schema.literal).toBe(_literal)
    expect(schema.enum).toBe(_enum)
    expect(schema.object).toBe(_object)
    expect(schema.array).toBe(_array)
    expect(schema.tuple).toBe(_tuple)
    expect(schema.record).toBe(_record)
    expect(schema.or).toBe(_or)
    expect(schema.blob).toBe(_blob)
    expect(schema.file).toBe(_file)
    expect(schema.arrayBuffer).toBe(_arrayBuffer)
  })

  test('supports user profile defaults and optional keys', () => {
    const profile = schema.object({
      id: schema.string(),
      nickname: schema.string().optional(),
      score: schema.number(),
      active: schema.boolean(),
    })

    expect(profile.parse({ id: 'u_1' })).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
    expect(profile.parse({ id: 'u_1', nickname: undefined })).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
  })

  test('supports primitive defaults for boolean and exact null schema', () => {
    expect(schema.boolean().parse(undefined)).toBe(false)
    expect(schema.null().parse(undefined)).toBeNull()
    expect(schema.null().parse(null)).toBeNull()
  })

  test('covers internal primitive definitions that are otherwise short-circuited', () => {
    const booleanSchema = schema.boolean() as Record<symbol, unknown>
    const nullSchema = schema.null() as Record<symbol, unknown>
    const booleanDefinition = Object.getOwnPropertySymbols(booleanSchema)
      .map(symbol => booleanSchema[symbol])
      .find(value => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
      is: (value: unknown) => boolean
    }
    const nullDefinition = Object.getOwnPropertySymbols(nullSchema)
      .map(symbol => nullSchema[symbol])
      .find(value => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
      is: (value: unknown) => boolean
      zero: () => null
    }

    expect(booleanDefinition.is(true)).toBe(true)
    expect(nullDefinition.is(null)).toBe(true)
    expect(nullDefinition.zero()).toBeNull()
  })

  test('keeps optional defaulted field and nullish behavior distinct', () => {
    const requestSchema = schema.object({
      locale: schema.string().optional().default('zh-CN'),
      timezone: schema.string().nullish(),
      theme: schema.string().null(),
    })

    expect(requestSchema.parse({})).toEqual({
      locale: 'zh-CN',
      theme: null,
    })
    expect(requestSchema.parse({ timezone: null })).toEqual({
      locale: 'zh-CN',
      theme: null,
      timezone: null,
    })
    expect(() => requestSchema.parse({ theme: 'dark' })).not.toThrow()
  })

  test('maps alias input key without changing output key', () => {
    const querySchema = schema.object({
      pageSize: schema.number().alias('page_size').default(20),
      page: schema.number().default(1),
    })

    expect(querySchema.parse({ page_size: 50 })).toEqual({
      page: 1,
      pageSize: 50,
    })
  })

  test('runs refine for domain rules', () => {
    const password = schema.string().refine(value => value.length >= 8, 'password too short')
    const payload = schema.object({
      password,
      confirm: schema.string().refine(value => value.endsWith('!')),
    })

    expect(payload.parse({ password: 'abcdefgh', confirm: 'hello!' })).toEqual({
      confirm: 'hello!',
      password: 'abcdefgh',
    })

    expect(() => payload.parse({ password: 'short', confirm: 'hello' })).toThrowError(SchemaError)

    try {
      payload.parse({ password: 'short', confirm: 'hello' })
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError)
      expect((error as SchemaError).issues).toEqual([
        {
          code: 'custom',
          expected: 'string',
          message: 'password too short',
          path: ['password'],
          received: 'short',
        },
        {
          code: 'custom',
          expected: 'string',
          message: 'Expected string at confirm, received "hello"',
          path: ['confirm'],
          received: 'hello',
        },
      ])
    }
  })

  test('supports refine returning string and Error', () => {
    const schemaValue = schema.number()
      .refine(value => (value > 0 ? undefined : 'must be positive'))
      .refine(value => (value < 10 ? undefined : new Error('must be less than 10')))

    expect(schemaValue.parse(5)).toBe(5)

    expect(() => schemaValue.parse(0)).toThrowError(SchemaError)
    expect(() => schemaValue.parse(10)).toThrowError(SchemaError)
  })

  test('passes through any and unknown while still honoring refine', () => {
    const uploadSchema = schema.object({
      metadata: schema.any(),
      raw: schema.unknown().refine(value => typeof value === 'object' && value !== null, 'raw must be object'),
    })

    const raw = { ext: 'png', size: 128 }
    const metadata = ['skip', 'validation']

    expect(uploadSchema.parse({ metadata, raw })).toEqual({ metadata, raw })
    expect(() => uploadSchema.parse({ raw: 'bad' })).toThrowError(SchemaError)
  })

  test('parses literal, enum and union values', () => {
    const status = schema.enum(['draft', 'published'] as const)
    const channel = schema.enum({ Web: 'web', Mobile: 'mobile', Retry: 3 } as const)
    const id = schema.or(schema.string().refine(value => value.startsWith('u_')), schema.number())

    expect(status.parse(undefined)).toBe('draft')
    expect(channel.parse(undefined)).toBe('web')
    expect(id.parse('u_123')).toBe('u_123')
    expect(id.parse(9)).toBe(9)
    expect(schema.literal('ok').parse(undefined)).toBe('ok')
    expect(() => status.parse('archived')).toThrowError(SchemaError)
    expect(() => channel.parse(false)).toThrowError(SchemaError)
    expect(() => schema.literal('ok').parse('no')).toThrowError(SchemaError)
    expect(() => id.parse(false)).toThrowError(SchemaError)
  })

  test('supports tuple and record structures for request payloads', () => {
    const coordinate = schema.tuple([schema.number(), schema.number().default(30)])
    const headers = schema.record(schema.string())

    expect(coordinate.parse([120])).toEqual([120, 30])
    expect(coordinate.parse([120, 31])).toEqual([120, 31])
    expect(headers.parse({ 'x-trace-id': 'trace-1' })).toEqual({ 'x-trace-id': 'trace-1' })
    expect(headers.parse({})).toEqual({})
    expect(() => coordinate.parse('bad')).toThrowError(SchemaError)
    expect(() => coordinate.parse([120, 'bad'])).toThrowError(SchemaError)
    expect(() => headers.parse({ retry: 1 })).toThrowError(SchemaError)
    expect(() => headers.parse([])).toThrowError(SchemaError)
  })

  test('supports blob file and arrayBuffer payloads', () => {
    const body = schema.arrayBuffer()
    const cover = schema.blob()
    const attachment = schema.file()

    const pdf = new Blob(['pdf'], { type: 'application/pdf' })
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    const bytes = new ArrayBuffer(4)

    expect(body.parse(bytes)).toBe(bytes)
    expect(cover.parse(pdf)).toBe(pdf)
    expect(attachment.parse(avatar)).toBe(avatar)
    expect(body.parse(undefined)).toBeInstanceOf(ArrayBuffer)
    expect(cover.parse(undefined)).toBeInstanceOf(Blob)
    expect(attachment.parse(undefined)).toBeInstanceOf(File)
    expect(() => body.parse({})).toThrowError(SchemaError)
    expect(() => cover.parse('bad')).toThrowError(SchemaError)
    expect(() => attachment.parse(pdf)).toThrowError(SchemaError)
  })

  test('supports recursive trees and deep references to root self', () => {
    const tree = schema.object({
      id: schema.string(),
      get children() {
        return schema.array(tree)
      },
      meta: schema.object({
        get snapshots() {
          return schema.array(schema.array(schema.array(tree)))
        },
      }),
    })

    expect(tree.parse({ id: 'root' })).toEqual({
      children: [],
      id: 'root',
      meta: {
        snapshots: [],
      },
    })

    expect(
      tree.parse({
        children: [{ id: 'leaf' }],
        id: 'root',
        meta: {
          snapshots: [[[{ id: 'child' }]]],
        },
      }),
    ).toEqual({
      children: [
        {
          children: [],
          id: 'leaf',
          meta: {
            snapshots: [],
          },
        },
      ],
      id: 'root',
      meta: {
        snapshots: [
          [
            [
              {
                children: [],
                id: 'child',
                meta: {
                  snapshots: [],
                },
              },
            ],
          ],
        ],
      },
    })
  })

  test('supports nested self for branch recursion', () => {
    const root = schema.object({
      name: schema.string(),
      get branch() {
        const branch = schema.object({
          name: schema.string(),
          get children() {
            return schema.array(branch)
          },
          get roots() {
            return schema.array(root)
          },
        })

        return branch
      },
    })

    expect(
      root.parse({
        branch: {
          children: [{ name: 'branch-child' }],
          name: 'branch-root',
        },
        name: 'root',
      }),
    ).toEqual({
      branch: {
        children: [
          {
            children: [],
            name: 'branch-child',
            roots: [],
          },
        ],
        name: 'branch-root',
        roots: [],
      },
      name: 'root',
    })
  })

  test('supports multi-dimensional arrays of object payloads', () => {
    const matrix = schema.array(schema.array(schema.array(schema.object({
      name: schema.string(),
    }))))

    expect(matrix.parse([[[{ name: 'A' }]]])).toEqual([[[{ name: 'A' }]]])
    expect(() => matrix.parse('bad')).toThrowError(SchemaError)
    expect(() => matrix.parse([[[{ name: 1 } as never]]])).toThrowError(SchemaError)
  })

  test('returns immutable chained schema objects', () => {
    const base = schema.string()
    const optionalValue = base.optional()
    const defaultValue = base.default('x')

    expect(base).not.toBe(optionalValue)
    expect(base).not.toBe(defaultValue)
    expect(base.parse(undefined)).toBe('')
    expect(optionalValue.parse(undefined)).toBeUndefined()
    expect(defaultValue.parse(undefined)).toBe('x')
  })

  test('exposes schema identity helper', () => {
    expect(isSchema(schema.string())).toBe(true)
    expect(isSchema({ parse() {} })).toBe(false)
  })

  test('formats nested paths in errors', () => {
    const payload = schema.object({
      items: schema.array(schema.object({
        id: schema.number(),
      })),
    })

    expect(() => payload.parse({ items: [{ id: 'bad' }] })).toThrowError(SchemaError)

    try {
      payload.parse({ items: [{ id: 'bad' }] })
    } catch (error) {
      expect((error as SchemaError).issues[0]).toEqual({
        code: 'invalid_type',
        expected: 'number',
        message: 'Expected number at items[0].id, received "bad"',
        path: ['items', 0, 'id'],
        received: 'bad',
      })
    }
  })

  test('handles root object zero values and zero-value failures', () => {
    const report = schema.object({
      items: schema.array(schema.number()),
      note: schema.string().optional(),
      meta: schema.record(schema.string()),
      title: schema.string(),
    })

    expect(report.parse(undefined)).toEqual({
      items: [],
      meta: {},
      title: '',
    })

    const invalidDefault = schema.object({
      title: schema.string().refine(() => false, 'title missing'),
    })

    expect(() => invalidDefault.parse(undefined)).toThrowError(SchemaError)
  })

  test('handles union and tuple zero values including failure paths', () => {
    expect(schema.or(schema.string(), schema.number()).parse(undefined)).toBe('')
    expect(schema.record(schema.string()).parse(undefined)).toEqual({})
    expect(schema.tuple([schema.string(), schema.number()]).parse(undefined)).toEqual(['', 0])
    expect(() => schema.or(schema.string().refine(() => false, 'bad union first'), schema.number()).parse(undefined)).toThrowError(
      SchemaError,
    )
    expect(() => schema.tuple([schema.string().refine(() => false, 'bad tuple')]).parse(undefined)).toThrowError(
      SchemaError,
    )
  })

  test('formats root errors and SchemaError fallback message', () => {
    const error = new SchemaError([])
    expect(error.message).toBe('Schema parse failed')
    expect(() => schema.string().parse(1)).toThrowError(SchemaError)

    try {
      schema.string().parse(1)
    } catch (thrown) {
      expect((thrown as SchemaError).issues[0].message).toBe('Expected string at <root>, received 1')
    }
  })

  test('clones default values with structuredClone when available', () => {
    const payload = schema.object({
      meta: schema.record(schema.any()).default({ tags: ['a'] }),
    })

    const first = payload.parse({})
    const second = payload.parse({})

    ;(first.meta.tags as string[]).push('b')
    expect(second).toEqual({ meta: { tags: ['a'] } })
  })

  test('falls back to manual clone without structuredClone', () => {
    globalThis.structuredClone = undefined

    const payload = schema.object({
      bytes: schema.arrayBuffer().default(new ArrayBuffer(2)),
      nested: schema.record(schema.any()).default({ items: ['a'] }),
      tags: schema.array(schema.string()).default(['x']),
    })

    const first = payload.parse({})
    const second = payload.parse({})

    expect(first.bytes).not.toBe(second.bytes)
    expect(first.nested).not.toBe(second.nested)
    expect(first.tags).not.toBe(second.tags)

    first.nested.items = ['changed']
    first.tags.push('y')

    expect(second).toEqual({
      bytes: second.bytes,
      nested: { items: ['a'] },
      tags: ['x'],
    })
  })

  test('treats null-prototype objects as plain objects', () => {
    const input = Object.assign(Object.create(null), {
      'x-request-id': 'trace-2',
    }) as Record<string, string>

    expect(schema.record(schema.string()).parse(input)).toEqual({
      'x-request-id': 'trace-2',
    })
  })

  test('covers remaining expected type and describe value branches', () => {
    expect(schema.any().parse(undefined)).toBeUndefined()
    expect(schema.unknown().parse(undefined)).toBeUndefined()
    expect(() => schema.boolean().refine(() => false).parse(true)).toThrowError('Expected boolean at <root>, received true')
    expect(() => schema.file().refine(() => false).parse(new File([], 'cover.png'))).toThrowError(
      'Expected File at <root>, received File(cover.png)',
    )
    expect(() => schema.null().refine(() => false).parse(null)).toThrowError('Expected null at <root>, received null')
    expect(() => schema.any().refine(() => false).parse(undefined)).toThrowError(
      'Expected any at <root>, received undefined',
    )

    expect(() => (schema.string() as never).refine(1)).toThrowError('refine() requires a validation function')
    expect(() => schema.string().parse(null)).toThrowError('Expected string at <root>, received null')
    expect(() => schema.string().parse(new File([], 'avatar.png'))).toThrowError(
      'Expected string at <root>, received File(avatar.png)',
    )
    expect(() => schema.string().parse(new Blob())).toThrowError(
      'Expected string at <root>, received Blob(application/octet-stream)',
    )
    expect(() => schema.string().parse(new ArrayBuffer(1))).toThrowError(
      'Expected string at <root>, received ArrayBuffer(1)',
    )
    expect(() => schema.string().parse([])).toThrowError('Expected string at <root>, received array')
    expect(() => schema.string().parse(new Date())).toThrowError('Expected string at <root>, received [object Date]')
    expect(() => schema.object({ name: schema.string() }).parse([])).toThrowError(
      'Expected object at <root>, received array',
    )
    expect(() => schema.arrayBuffer().parse(null)).toThrowError('Expected ArrayBuffer at <root>, received null')
    expect(() => schema.blob().parse(null)).toThrowError('Expected Blob at <root>, received null')
    expect(() => schema.array(schema.string()).parse(null)).toThrowError('Expected array at <root>, received null')
    expect(() => schema.record(schema.string()).parse(null)).toThrowError('Expected object at <root>, received null')
    expect(() => schema.tuple([schema.string()]).parse(null)).toThrowError('Expected tuple at <root>, received null')
    expect(() => schema.any().refine(() => false).parse('x')).toThrowError('Expected any at <root>, received "x"')
    expect(() => schema.unknown().refine(() => false).parse('x')).toThrowError(
      'Expected unknown at <root>, received "x"',
    )
    expect(() => schema.enum(['live'] as const).refine(() => false).parse('live')).toThrowError(
      'Expected "live" at <root>, received "live"',
    )
    expect(() => schema.literal('ok').refine(() => false).parse('ok')).toThrowError(
      'Expected "ok" at <root>, received "ok"',
    )
    expect(() => schema.or(schema.string(), schema.number()).refine(() => false).parse('x')).toThrowError(
      'Expected string | number at <root>, received "x"',
    )
    expect(() => schema.object({ name: schema.string() }).refine(() => false).parse({ name: 'x' })).toThrowError(
      'Expected object at <root>, received object',
    )
    expect(() => schema.record(schema.string()).refine(() => false).parse({ key: 'x' })).toThrowError(
      'Expected object at <root>, received object',
    )
    expect(() => schema.tuple([schema.string()]).refine(() => false).parse(['x'])).toThrowError(
      'Expected tuple at <root>, received array',
    )
  })

  test('omits optional values inside records and clones nullish defaults', () => {
    expect(schema.record(schema.string().optional()).parse({ trace: undefined })).toEqual({})

    const payload = schema.object({
      maybeNull: schema.string().null().default(null),
      maybeUndefined: schema.any().default(undefined as never),
    })

    expect(payload.parse({})).toEqual({
      maybeNull: null,
      maybeUndefined: undefined,
    })
  })

  test('rejects invalid schema definitions', () => {
    expect(() => createObjectSchema(undefined as never)).toThrowError(
      'object schema requires a plain object',
    )
    expect(() => createArraySchema(undefined as never)).toThrowError('array item must be a schema')
    expect(() => createTupleSchema([undefined as never])).toThrowError('tuple item must be a schema')
    expect(() => createUnionSchema([undefined as never])).toThrowError('or option must be a schema')
    expect(() => createObjectEnumSchema({})).toThrowError(
      'enum schema requires at least one string or number value',
    )
  })

  test('rejects invalid object fields', () => {
    expect(() => createObjectSchema(null as never).parse({})).toThrowError(
      'object schema requires a plain object',
    )
    expect(
      () =>
        createObjectSchema({
          bad: undefined as never,
        }).parse({}),
    ).toThrowError('object field "bad" must be a schema')
  })
})
