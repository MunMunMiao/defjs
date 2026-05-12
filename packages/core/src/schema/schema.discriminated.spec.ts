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
    expect(event.parse({ type: 'click', x: 10, y: 20 })).toEqual({ type: 'click', x: 10, y: 20 })
    expect(event.parse({ type: 'scroll', delta: 5 })).toEqual({ type: 'scroll', delta: 5 })
    expect(event.parse({ type: 'keypress', key: 'Enter' })).toEqual({ type: 'keypress', key: 'Enter' })
  })

  test('reports invalid_union with declared values on unknown discriminator', () => {
    try {
      event.parse({ type: 'unknown', payload: 'no' })
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError)
      const issue = (error as SchemaError).issues[0]
      expect(issue?.code).toBe('invalid_union')
      expect(issue?.path).toEqual(['type'])
      expect(issue?.expected).toBe('"click" | "scroll" | "keypress"')
      expect(issue?.message).toContain('"unknown"')
    }
  })

  test('forwards selected branch issues with full path', () => {
    expect(() => event.parse({ type: 'click', x: 'no', y: 20 })).toThrowError(SchemaError)

    try {
      event.parse({ type: 'click', x: 'no', y: 20 })
      throw new Error('should have thrown')
    } catch (error) {
      const issue = (error as SchemaError).issues[0]
      expect(issue?.path).toEqual(['x'])
      expect(issue?.code).toBe('invalid_type')
    }
  })

  test('rejects non-object payloads', () => {
    expect(() => event.parse('click')).toThrowError(SchemaError)
    expect(() => event.parse([])).toThrowError(SchemaError)
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
    await expect(event.parseAsync({ type: 'scroll', delta: 3 })).resolves.toEqual({ type: 'scroll', delta: 3 })
  })
})
