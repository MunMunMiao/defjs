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

    const [err, val] = report.parse(undefined)
    expect(err).toBeNull()
    expect(val).toEqual({
      items: [],
      meta: {},
      title: '',
    })

    const invalidDefault = schema.object({
      title: schema.string().refine(() => false, 'title missing'),
    })

    const [badErr] = invalidDefault.parse(undefined)
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('handles union and tuple zero values including failure paths', () => {
    const [uErr, uVal] = schema.or(schema.string(), schema.number()).parse(undefined)
    expect(uErr).toBeNull()
    expect(uVal).toBe('')

    const [rErr, rVal] = schema.record(schema.string()).parse(undefined)
    expect(rErr).toBeNull()
    expect(rVal).toEqual({})

    const [tErr, tVal] = schema.tuple([schema.string(), schema.number()]).parse(undefined)
    expect(tErr).toBeNull()
    expect(tVal).toEqual(['', 0])

    const [unionFailErr] = schema
      .or(
        schema.string().refine(() => false, 'bad union first'),
        schema.number(),
      )
      .parse(undefined)
    expect(unionFailErr).toBeInstanceOf(SchemaError)

    const [tupleFailErr] = schema.tuple([schema.string().refine(() => false, 'bad tuple')]).parse(undefined)
    expect(tupleFailErr).toBeInstanceOf(SchemaError)
  })

  test('clones default values with structuredClone when available', () => {
    const payload = schema.object({
      meta: schema.record(schema.any()).default({ tags: ['a'] }),
    })

    const [, first] = payload.parse({})
    const [, second] = payload.parse({})

    ;(first!.meta['tags'] as string[]).push('b')
    expect(second).toEqual({ meta: { tags: ['a'] } })
  })

  test('falls back to manual clone without structuredClone', () => {
    globalThis.structuredClone = undefined as unknown as typeof structuredClone

    const payload = schema.object({
      bytes: schema.arrayBuffer().default(new ArrayBuffer(2)),
      nested: schema.record(schema.any()).default({ items: ['a'] }),
      tags: schema.array(schema.string()).default(['x']),
    })

    const [, first] = payload.parse({})
    const [, second] = payload.parse({})

    expect(first!.bytes).not.toBe(second!.bytes)
    expect(first!.nested).not.toBe(second!.nested)
    expect(first!.tags).not.toBe(second!.tags)

    first!.nested['items'] = ['changed']
    first!.tags.push('y')

    expect(second).toEqual({
      bytes: second!.bytes,
      nested: { items: ['a'] },
      tags: ['x'],
    })
  })

  test('omits optional values inside records and clones nullish defaults', () => {
    const [recErr, recVal] = schema.record(schema.string().optional()).parse({ trace: undefined })
    expect(recErr).toBeNull()
    expect(recVal).toEqual({})

    const payload = schema.object({
      maybeNull: schema.string().null().default(null),
      maybeUndefined: schema.any().default(undefined as never),
    })

    const [err, val] = payload.parse({})
    expect(err).toBeNull()
    expect(val).toEqual({
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
