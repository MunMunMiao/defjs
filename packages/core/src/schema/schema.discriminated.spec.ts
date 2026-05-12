import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema discriminatedUnion', () => {
  const event = schema.discriminatedUnion('type', [
    schema.object({
      type: schema.literal('click'),
      x: schema.number(),
      y: schema.number(),
    }),
    schema.object({
      type: schema.literal('scroll'),
      delta: schema.number(),
    }),
    schema.object({
      type: schema.literal('keypress'),
      key: schema.string(),
    }),
  ])

  test('routes payload by discriminator field in O(1)', () => {
    const [e1, v1] = event.parse({ type: 'click', x: 10, y: 20 })
    expect(e1).toBeNull()
    expect(v1).toEqual({ type: 'click', x: 10, y: 20 })

    const [e2, v2] = event.parse({ type: 'scroll', delta: 5 })
    expect(e2).toBeNull()
    expect(v2).toEqual({ type: 'scroll', delta: 5 })

    const [e3, v3] = event.parse({ type: 'keypress', key: 'Enter' })
    expect(e3).toBeNull()
    expect(v3).toEqual({ type: 'keypress', key: 'Enter' })
  })

  test('reports invalid_union with declared values on unknown discriminator', () => {
    const [err] = event.parse({ type: 'unknown', payload: 'no' })
    expect(err).toBeInstanceOf(SchemaError)
    const issue = err!.issues[0]
    expect(issue?.code).toBe('invalid_union')
    expect(issue?.path).toEqual(['type'])
    expect(issue?.expected).toBe('"click" | "scroll" | "keypress"')
    expect(issue?.message).toContain('"unknown"')
  })

  test('forwards selected branch issues with full path', () => {
    const [err] = event.parse({ type: 'click', x: 'no', y: 20 })
    expect(err).toBeInstanceOf(SchemaError)
    const issue = err!.issues[0]
    expect(issue?.path).toEqual(['x'])
    expect(issue?.code).toBe('invalid_type')
  })

  test('rejects non-object payloads', () => {
    const [e1] = event.parse('click')
    expect(e1).toBeInstanceOf(SchemaError)

    const [e2] = event.parse([])
    expect(e2).toBeInstanceOf(SchemaError)
  })

  test('rejects option list with duplicate discriminator value at chain time', () => {
    expect(() =>
      schema.discriminatedUnion('type', [
        schema.object({ type: schema.literal('a'), value: schema.string() }),
        schema.object({ type: schema.literal('a'), other: schema.number() }) as never,
      ]),
    ).toThrowError('duplicate discriminator value')
  })

  test('rejects option missing the discriminator field at chain time', () => {
    expect(() =>
      schema.discriminatedUnion('type', [schema.object({ type: schema.literal('a') }), schema.object({ other: schema.string() }) as never]),
    ).toThrowError('missing discriminator field')
  })

  test('rejects discriminator field that is not literal', () => {
    expect(() => schema.discriminatedUnion('type', [schema.object({ type: schema.string() }) as never])).toThrowError(
      'must be a literal schema',
    )
  })

  test('async parse routes via discriminator as well', async () => {
    const [err, val] = await event.parseAsync({ type: 'scroll', delta: 3 })
    expect(err).toBeNull()
    expect(val).toEqual({ type: 'scroll', delta: 3 })
  })
})
