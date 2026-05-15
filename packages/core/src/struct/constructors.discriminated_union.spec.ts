import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'

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
    const [e1, v1] = event.parse({ type: 'click', x: 10, y: 20 })
    if (e1) {
      throw e1
    }
    expect(v1).toEqual({ type: 'click', x: 10, y: 20 })

    const [e2, v2] = event.parse({ type: 'scroll', delta: 5 })
    if (e2) {
      throw e2
    }
    expect(v2).toEqual({ type: 'scroll', delta: 5 })

    const [e3, v3] = event.parse({ type: 'keypress', key: 'Enter' })
    if (e3) {
      throw e3
    }
    expect(v3).toEqual({ type: 'keypress', key: 'Enter' })
  })

  test('reports invalid_union with declared values on unknown discriminator', () => {
    const [err] = event.parse({ type: 'unknown', payload: 'no' })
    expect(err).toBeInstanceOf(StructError)
    const issue = err?.issues[0]
    expect(issue?.code).toBe('invalid_union')
    expect(issue?.path).toEqual(['type'])
    expect(issue?.expected).toBe('"click" | "scroll" | "keypress"')
    expect(issue?.message).toContain('"unknown"')
  })

  test('forwards selected branch issues with full path', () => {
    const [err] = event.parse({ type: 'click', x: 'no', y: 20 })
    expect(err).toBeInstanceOf(StructError)
    const issue = err?.issues[0]
    expect(issue?.path).toEqual(['x'])
    expect(issue?.code).toBe('invalid_type')
  })

  test('rejects non-object payloads', () => {
    const [e1] = event.parse('click')
    expect(e1).toBeInstanceOf(StructError)

    const [e2] = event.parse([])
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

  test('async parse routes via discriminator as well', async () => {
    const [err, val] = await event.parseAsync({ type: 'scroll', delta: 3 })
    if (err) {
      throw err
    }
    expect(val).toEqual({ type: 'scroll', delta: 3 })
  })

  test('async parse fails on invalid branch', async () => {
    const [err] = await event.parseAsync({ type: 'click', x: 'no', y: 20 })
    expect(err).toBeInstanceOf(StructError)
  })

  test('async parse fails on non-object payload', async () => {
    const [err] = await event.parseAsync('not-an-object')
    expect(err).toBeInstanceOf(StructError)
  })

  test('async parse fails on unknown discriminator', async () => {
    const [err] = await event.parseAsync({ type: 'unknown' })
    expect(err).toBeInstanceOf(StructError)
  })
})
