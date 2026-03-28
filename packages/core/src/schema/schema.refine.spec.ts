import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema refine behavior', () => {
  test('runs refine for domain rules', () => {
    const password = schema.string().refine(value => value['length'] >= 8, 'password too short')
    const payload = schema.object({
      password,
      confirm: schema.string().refine(value => value['endsWith']('!')),
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
    const schemaValue = schema
      .number()
      .refine(value => (Number(value) > 0 ? undefined : 'must be positive'))
      .refine(value => (Number(value) < 10 ? undefined : new Error('must be less than 10')))

    expect(schemaValue.parse(5)).toBe(5)

    expect(() => schemaValue.parse(0)).toThrowError(SchemaError)
    expect(() => schemaValue.parse(10)).toThrowError(SchemaError)
  })

  test('formats nested paths in errors', () => {
    const payload = schema.object({
      items: schema.array(
        schema.object({
          id: schema.number(),
        }),
      ),
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

  test('formats root errors and SchemaError fallback message', () => {
    const error = new SchemaError([])
    expect(error.message).toBe('Schema parse failed')
    expect(() => schema.string().parse(1)).toThrowError(SchemaError)

    try {
      schema.string().parse(1)
    } catch (thrown) {
      expect((thrown as SchemaError).issues[0]?.message).toBe('Expected string at <root>, received 1')
    }
  })

  test('covers remaining expected type and describe value branches', () => {
    expect(schema.any().parse(undefined)).toBeUndefined()
    expect(schema.unknown().parse(undefined)).toBeUndefined()
    expect(() =>
      schema
        .boolean()
        .refine(() => false)
        .parse(true),
    ).toThrowError('Expected boolean at <root>, received true')
    expect(() =>
      schema
        .file()
        .refine(() => false)
        .parse(new File([], 'cover.png')),
    ).toThrowError('Expected File at <root>, received File(cover.png)')
    expect(() =>
      schema
        .null()
        .refine(() => false)
        .parse(null),
    ).toThrowError('Expected null at <root>, received null')
    expect(() =>
      schema
        .any()
        .refine(() => false)
        .parse(undefined),
    ).toThrowError('Expected any at <root>, received undefined')

    expect(() => (schema.string() as unknown as { refine: (value: number) => unknown }).refine(1)).toThrowError(
      'refine() requires a validation function',
    )
    expect(() => schema.string().parse(null)).toThrowError('Expected string at <root>, received null')
    expect(() => schema.string().parse(new File([], 'avatar.png'))).toThrowError('Expected string at <root>, received File(avatar.png)')
    expect(() => schema.string().parse(new Blob())).toThrowError('Expected string at <root>, received Blob(application/octet-stream)')
    expect(() => schema.string().parse(new ArrayBuffer(1))).toThrowError('Expected string at <root>, received ArrayBuffer(1)')
    expect(() => schema.string().parse([])).toThrowError('Expected string at <root>, received array')
    expect(() => schema.string().parse(new Date())).toThrowError('Expected string at <root>, received [object Date]')
    expect(() => schema.object({ name: schema.string() }).parse([])).toThrowError('Expected object at <root>, received array')
    expect(() => schema.arrayBuffer().parse(null)).toThrowError('Expected ArrayBuffer at <root>, received null')
    expect(() => schema.blob().parse(null)).toThrowError('Expected Blob at <root>, received null')
    expect(() => schema.array(schema.string()).parse(null)).toThrowError('Expected array at <root>, received null')
    expect(() => schema.record(schema.string()).parse(null)).toThrowError('Expected object at <root>, received null')
    expect(() => schema.tuple([schema.string()]).parse(null)).toThrowError('Expected tuple at <root>, received null')
    expect(() =>
      schema
        .any()
        .refine(() => false)
        .parse('x'),
    ).toThrowError('Expected any at <root>, received "x"')
    expect(() =>
      schema
        .unknown()
        .refine(() => false)
        .parse('x'),
    ).toThrowError('Expected unknown at <root>, received "x"')
    expect(() =>
      schema
        .enum(['live'] as const)
        .refine(() => false)
        .parse('live'),
    ).toThrowError('Expected "live" at <root>, received "live"')
    expect(() =>
      schema
        .literal('ok')
        .refine(() => false)
        .parse('ok'),
    ).toThrowError('Expected "ok" at <root>, received "ok"')
    expect(() =>
      schema
        .or(schema.string(), schema.number())
        .refine(() => false)
        .parse('x'),
    ).toThrowError('Expected string | number at <root>, received "x"')
    expect(() =>
      schema
        .object({ name: schema.string() })
        .refine(() => false)
        .parse({ name: 'x' }),
    ).toThrowError('Expected object at <root>, received object')
    expect(() =>
      schema
        .record(schema.string())
        .refine(() => false)
        .parse({ key: 'x' }),
    ).toThrowError('Expected object at <root>, received object')
    expect(() =>
      schema
        .tuple([schema.string()])
        .refine(() => false)
        .parse(['x']),
    ).toThrowError('Expected tuple at <root>, received array')
  })
})
