import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema transform and pipe', () => {
  test('transform maps the parsed value to a new shape', () => {
    const upper = schema.string().transform(value => value.toUpperCase())

    expect(upper.parse('hello')).toBe('HELLO')
  })

  test('transform runs after refinements', () => {
    const slug = schema
      .string()
      .min(3)
      .transform(value => value.replace(/\s+/g, '-'))

    expect(slug.parse('hello world')).toBe('hello-world')
    expect(() => slug.parse('a')).toThrowError(SchemaError)
  })

  test('chained transforms apply in declaration order', () => {
    const pipeline = schema
      .string()
      .transform(value => value.trim())
      .transform(value => value.length)

    expect(pipeline.parse('  hello  ')).toBe(5)
  })

  test('refinement after transform sees the transformed value', () => {
    const positiveLength = schema
      .string()
      .transform(value => value.length)
      .refine(value => Number(value) > 0 || 'must contain characters')

    expect(positiveLength.parse('abc')).toBe(3)
    expect(() => positiveLength.parse('')).toThrowError('must contain characters')
  })

  test('pipe forwards output to another schema and surfaces its issues', () => {
    const parsedNumber = schema
      .string()
      .transform(value => Number.parseInt(value, 10))
      .pipe(schema.number().int().nonnegative())

    expect(parsedNumber.parse('42')).toBe(42)
    expect(() => parsedNumber.parse('-3')).toThrowError(SchemaError)
  })

  test('async transform composes with parseAsync', async () => {
    const lookup = schema.string().transform(async value => `loaded:${value}`)

    await expect(lookup.parseAsync('x')).resolves.toBe('loaded:x')
  })

  test('pipe rejects non-schema targets at chain time', () => {
    expect(() => schema.string().pipe(null as never)).toThrowError('pipe() requires a schema target')
  })

  test('transform fn must be a function', () => {
    expect(() => schema.string().transform(null as never)).toThrowError('transform() requires a function')
  })
})
