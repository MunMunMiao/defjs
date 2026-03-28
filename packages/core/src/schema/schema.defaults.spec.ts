import { afterEach, describe, expect, test, vi } from 'vitest'
import { SchemaError, schema } from './index'
import { createArraySchema, createObjectEnumSchema, createObjectSchema, createTupleSchema, createUnionSchema } from './schema'

const originalStructuredClone = globalThis.structuredClone

afterEach(() => {
  globalThis.structuredClone = originalStructuredClone
  vi.restoreAllMocks()
})

describe('schema defaults and edge cases', () => {
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
    expect(() =>
      schema
        .or(
          schema.string().refine(() => false, 'bad union first'),
          schema.number(),
        )
        .parse(undefined),
    ).toThrowError(SchemaError)
    expect(() => schema.tuple([schema.string().refine(() => false, 'bad tuple')]).parse(undefined)).toThrowError(SchemaError)
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
    globalThis.structuredClone = undefined as unknown as typeof structuredClone

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
    expect(() => createObjectSchema(undefined as never)).toThrowError('object schema requires a plain object')
    expect(() => createArraySchema(undefined as never)).toThrowError('array item must be a schema')
    expect(() => createTupleSchema([undefined as never])).toThrowError('tuple item must be a schema')
    expect(() => createUnionSchema([undefined as never])).toThrowError('or option must be a schema')
    expect(() => createObjectEnumSchema({})).toThrowError('enum schema requires at least one string or number value')
  })

  test('rejects invalid object fields', () => {
    expect(() => createObjectSchema(null as never).parse({})).toThrowError('object schema requires a plain object')
    expect(() =>
      createObjectSchema({
        bad: undefined as never,
      }).parse({}),
    ).toThrowError('object field "bad" must be a schema')
  })
})
