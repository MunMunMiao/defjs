import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema transform and pipe', () => {
  test('transform maps the parsed value to a new shape', () => {
    const upper = schema.string().transform(
      value => value.toUpperCase(),
      value => value.toLowerCase(),
    )

    const [err, val] = upper.parse('hello')
    expect(err).toBeNull()
    expect(val).toBe('HELLO')
  })

  test('transform encodes back via the reverse function', () => {
    const upper = schema.string().transform(
      value => value.toUpperCase(),
      value => value.toLowerCase(),
    )

    expect(upper.encode('HELLO')).toBe('hello')
  })

  test('transform runs after refinements', () => {
    const slug = schema
      .string()
      .min(3)
      .transform(
        value => value.replace(/\s+/g, '-'),
        value => value.replace(/-/g, ' '),
      )

    const [okErr, okVal] = slug.parse('hello world')
    expect(okErr).toBeNull()
    expect(okVal).toBe('hello-world')
    const [badErr] = slug.parse('a')
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('chained transforms apply in declaration order on parse', () => {
    const pipeline = schema
      .string()
      .transform(
        value => value.trim(),
        value => value,
      )
      .transform(
        value => value.length,
        value => '_'.repeat(value),
      )

    const [err, val] = pipeline.parse('  hello  ')
    expect(err).toBeNull()
    expect(val).toBe(5)
  })

  test('chained transforms encode in reverse declaration order', () => {
    const pipeline = schema
      .string()
      .transform(
        value => value.trim(),
        value => value,
      )
      .transform(
        value => value.length,
        value => '_'.repeat(value),
      )

    expect(pipeline.encode(5)).toBe('_____')
  })

  test('refinement after transform sees the transformed value', () => {
    const positiveLength = schema
      .string()
      .transform(
        value => value.length,
        value => '_'.repeat(value),
      )
      .refine(value => Number(value) > 0 || 'must contain characters')

    const [okErr, okVal] = positiveLength.parse('abc')
    expect(okErr).toBeNull()
    expect(okVal).toBe(3)
    const [badErr] = positiveLength.parse('')
    expect(badErr).toBeInstanceOf(SchemaError)
    expect(badErr?.message).toContain('must contain characters')
  })

  test('pipe forwards output to another schema and surfaces its issues', () => {
    const parsedNumber = schema
      .string()
      .transform(
        value => Number.parseInt(value, 10),
        value => String(value),
      )
      .pipe(schema.number().int().nonnegative())

    const [okErr, okVal] = parsedNumber.parse('42')
    expect(okErr).toBeNull()
    expect(okVal).toBe(42)
    const [badErr] = parsedNumber.parse('-3')
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('pipe forwards output to another schema via parseAsync', async () => {
    const parsedNumber = schema
      .string()
      .transform(
        value => Number.parseInt(value, 10),
        value => String(value),
      )
      .pipe(schema.number().int().nonnegative())

    const [okErr, okVal] = await parsedNumber.parseAsync('42')
    expect(okErr).toBeNull()
    expect(okVal).toBe(42)
    const [badErr] = await parsedNumber.parseAsync('-3')
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('pipe + transform encodes through both layers', () => {
    const parsedNumber = schema
      .string()
      .transform(
        value => Number.parseInt(value, 10),
        value => String(value),
      )
      .pipe(schema.number().int().nonnegative())

    expect(parsedNumber.encode(42)).toBe('42')
  })

  test('async transform composes with parseAsync', async () => {
    const lookup = schema.string().transform(
      async value => `loaded:${value}`,
      value => value.replace(/^loaded:/, ''),
    )

    const [err, val] = await lookup.parseAsync('x')
    expect(err).toBeNull()
    expect(val).toBe('loaded:x')
  })

  test('transform decode throws non-SchemaError', async () => {
    const s = schema.string().transform(
      () => { throw new Error('decode failed') },
      value => value,
    )

    const [err] = await s.parseAsync('hello')
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]?.message).toContain('decode failed')
  })

  test('async transform decode throws non-Error primitive', async () => {
    const s = schema.string().transform(
      () => { throw 'not an error object' },
      value => value,
    )

    const [err] = await s.parseAsync('hello')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('sync transform decode throws non-SchemaError', () => {
    const s = schema.string().transform(
      () => { throw new Error('sync decode failed') },
      value => value,
    )

    const [err] = s.parse('hello')
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]?.message).toContain('sync decode failed')
  })

  test('sync transform decode throws non-Error primitive', () => {
    const s = schema.string().transform(
      () => { throw 'not an error object' },
      value => value,
    )

    const [err] = s.parse('hello')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('transform decode throws SchemaError', async () => {
    const inner = schema.string().min(5)
    const s = schema.string().transform(
      () => {
        const [err] = inner.parse('x')
        if (err) {
          throw err
        }
        return 'never'
      },
      value => value,
    )

    const [err] = await s.parseAsync('hello')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('pipe rejects non-schema targets at chain time', () => {
    expect(() => schema.string().pipe(null as never)).toThrowError('pipe() requires a schema target')
  })

  test('transform requires both decode and encode functions', () => {
    expect(() => schema.string().transform(null as never, null as never)).toThrowError(
      'transform() requires both decode and encode functions',
    )
    expect(() => schema.string().transform((value: string) => value, null as never)).toThrowError(
      'transform() requires both decode and encode functions',
    )
  })

  test('encode array passes through non-array', () => {
    const s = schema.array(schema.string().transform(
      value => value.toUpperCase(),
      value => value.toLowerCase(),
    ))
    expect((s as any).encode('not-array')).toBe('not-array')
  })

  test('encode tuple passes through non-array and extra items', () => {
    const s = schema.tuple([schema.string().transform(
      value => value.toUpperCase(),
      value => value.toLowerCase(),
    )])
    expect((s as any).encode('not-array')).toBe('not-array')
    expect((s as any).encode(['HELLO', 'EXTRA'])).toEqual(['hello', 'EXTRA'])
  })
})
