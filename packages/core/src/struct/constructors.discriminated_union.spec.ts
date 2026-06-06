import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'
import { parseStructTuple as parse } from './introspection'

describe('constructors.ts discriminatedUnion', () => {
  const event = struct.discriminatedUnion('type', [
    struct.object({
      type: struct.literal('click'),
      x: struct.number(),
      y: struct.number(),
    }),
    struct.object({
      type: struct.literal('scroll'),
      delta: struct.number(),
    }),
    struct.object({
      type: struct.literal('keypress'),
      key: struct.string(),
    }),
  ])

  test('routes payload by discriminator field in O(1)', () => {
    const [e1, v1] = parse(event, { type: 'click', x: 10, y: 20 })
    if (e1) {
      throw e1
    }
    expect(v1).toEqual({ type: 'click', x: 10, y: 20 })

    const [e2, v2] = parse(event, { type: 'scroll', delta: 5 })
    if (e2) {
      throw e2
    }
    expect(v2).toEqual({ type: 'scroll', delta: 5 })

    const [e3, v3] = parse(event, { type: 'keypress', key: 'Enter' })
    if (e3) {
      throw e3
    }
    expect(v3).toEqual({ type: 'keypress', key: 'Enter' })
  })

  test('reports invalid_union with declared values on unknown discriminator', () => {
    const [err] = parse(event, { type: 'unknown', payload: 'no' })
    expect(err).toBeInstanceOf(StructError)
    const issue = err?.issues[0]
    expect(issue?.code).toBe('invalid_union')
    expect(issue?.path).toEqual(['type'])
    expect(issue?.expected).toBe('"click" | "scroll" | "keypress"')
    expect(issue?.message).toContain('"unknown"')
  })

  test('forwards selected branch issues with full path', () => {
    const [err] = parse(event, { type: 'click', x: 'no', y: 20 })
    expect(err).toBeInstanceOf(StructError)
    const issue = err?.issues[0]
    expect(issue?.path).toEqual(['x'])
    expect(issue?.code).toBe('invalid_type')
  })

  test('rejects non-object payloads', () => {
    const [e1] = parse(event, 'click')
    expect(e1).toBeInstanceOf(StructError)

    const [e2] = parse(event, [])
    expect(e2).toBeInstanceOf(StructError)
  })

  test('rejects option list with duplicate discriminator value at chain time', () => {
    expect(() =>
      struct.discriminatedUnion('type', [
        struct.object({ type: struct.literal('a'), value: struct.string() }),
        struct.object({ type: struct.literal('a'), other: struct.number() }) as never,
      ]),
    ).toThrowError('duplicate discriminator value')
  })

  test('rejects option missing the discriminator field at chain time', () => {
    expect(() =>
      struct.discriminatedUnion('type', [struct.object({ type: struct.literal('a') }), struct.object({ other: struct.string() }) as never]),
    ).toThrowError('missing discriminator field')
  })

  test('rejects discriminator field that is not literal', () => {
    expect(() => struct.discriminatedUnion('type', [struct.object({ type: struct.string() }) as never])).toThrowError(
      'must be a literal schema',
    )
  })

  test('internal parse routes via discriminator as well', () => {
    const [err, val] = parse(event, { type: 'scroll', delta: 3 })
    if (err) {
      throw err
    }
    expect(val).toEqual({ type: 'scroll', delta: 3 })
  })

  test('internal parse fails on invalid branch', () => {
    const [err] = parse(event, { type: 'click', x: 'no', y: 20 })
    expect(err).toBeInstanceOf(StructError)
  })

  test('internal parse fails on non-object payload', () => {
    const [err] = parse(event, 'not-an-object')
    expect(err).toBeInstanceOf(StructError)
  })

  test('internal parse fails on unknown discriminator', () => {
    const [err] = parse(event, { type: 'unknown' })
    expect(err).toBeInstanceOf(StructError)
  })
})
