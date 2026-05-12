import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('string built-in constraints', () => {
  test('min / max / length enforce character counts', () => {
    expect(schema.string().min(3).parse('abc')).toBe('abc')
    expect(() => schema.string().min(3).parse('ab')).toThrowError(SchemaError)
    expect(() => schema.string().min(3).parse('ab')).toThrowError('String must contain at least 3 character(s)')

    expect(schema.string().max(4).parse('abcd')).toBe('abcd')
    expect(() => schema.string().max(4).parse('abcde')).toThrowError('String must contain at most 4 character(s)')

    expect(schema.string().length(2).parse('ab')).toBe('ab')
    expect(() => schema.string().length(2).parse('a')).toThrowError('String must contain exactly 2 character(s)')
  })

  test('email / url / uuid use sensible defaults and accept custom messages', () => {
    expect(schema.string().email().parse('a@b.com')).toBe('a@b.com')
    expect(() => schema.string().email().parse('not-an-email')).toThrowError('Invalid email')

    expect(schema.string().url().parse('https://example.com')).toBe('https://example.com')
    expect(() => schema.string().url().parse('not a url')).toThrowError('Invalid url')

    expect(schema.string().uuid().parse('123e4567-e89b-42d3-a456-426614174000')).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(() => schema.string().uuid().parse('zzz').valueOf()).toThrowError('Invalid UUID')

    expect(() => schema.string().email('bad email').parse('no')).toThrowError('bad email')
  })

  test('regex / startsWith / endsWith compose with other refinements', () => {
    const slug = schema.string().regex(/^[a-z0-9-]+$/, 'must be slug')
    expect(slug.parse('hello-world')).toBe('hello-world')
    expect(() => slug.parse('NOT_OK')).toThrowError('must be slug')

    const userId = schema.string().startsWith('u_').min(3)
    expect(userId.parse('u_abc')).toBe('u_abc')
    expect(() => userId.parse('a').valueOf()).toThrowError('String must start with "u_"')

    expect(schema.string().endsWith('.png').parse('cover.png')).toBe('cover.png')
    expect(() => schema.string().endsWith('.png').parse('cover.jpg')).toThrowError('String must end with ".png"')
  })

  test('chained string methods continue to expose StringSchemaMethods', () => {
    const result = schema
      .string()
      .min(3)
      .max(8)
      .regex(/^[a-z]+$/i)
      .parse('abcd')
    expect(result).toBe('abcd')
  })
})

describe('number built-in constraints', () => {
  test('min / max / gt / lt act as inclusive and exclusive bounds', () => {
    expect(schema.number().min(0).max(100).parse(50)).toBe(50)
    expect(schema.number().min(0).max(100).parse(0)).toBe(0)
    expect(schema.number().min(0).max(100).parse(100)).toBe(100)
    expect(() => schema.number().min(0).max(100).parse(-1)).toThrowError('Number must be greater than or equal to 0')
    expect(() => schema.number().min(0).max(100).parse(101)).toThrowError('Number must be less than or equal to 100')

    expect(() => schema.number().gt(0).parse(0)).toThrowError('Number must be greater than 0')
    expect(() => schema.number().lt(10).parse(10)).toThrowError('Number must be less than 10')
  })

  test('int / positive / negative / multipleOf cover common shape checks', () => {
    expect(schema.number().int().parse(7)).toBe(7)
    expect(() => schema.number().int().parse(3.14)).toThrowError('Number must be an integer')

    expect(schema.number().positive().parse(1)).toBe(1)
    expect(() => schema.number().positive().parse(0)).toThrowError('Number must be positive')

    expect(schema.number().negative().parse(-1)).toBe(-1)
    expect(() => schema.number().negative().parse(0)).toThrowError('Number must be negative')

    expect(schema.number().nonnegative().parse(0)).toBe(0)
    expect(() => schema.number().nonnegative().parse(-1)).toThrowError('Number must be non-negative')

    expect(schema.number().nonpositive().parse(0)).toBe(0)
    expect(() => schema.number().nonpositive().parse(1)).toThrowError('Number must be non-positive')

    expect(schema.number().multipleOf(5).parse(15)).toBe(15)
    expect(() => schema.number().multipleOf(5).parse(7)).toThrowError('Number must be a multiple of 5')
  })

  test('finite rejects NaN-poisoned literals via schema chain', () => {
    expect(schema.number().finite().parse(42)).toBe(42)
    expect(() => schema.number().finite().parse(Number.POSITIVE_INFINITY)).toThrowError('Number must be finite')
  })

  test('gte / lte are inclusive aliases of min / max', () => {
    expect(schema.number().gte(10).parse(10)).toBe(10)
    expect(() => schema.number().gte(10).parse(9)).toThrowError('Number must be greater than or equal to 10')

    expect(schema.number().lte(10).parse(10)).toBe(10)
    expect(() => schema.number().lte(10).parse(11)).toThrowError('Number must be less than or equal to 10')
  })
})

describe('array built-in constraints', () => {
  test('min / max / length / nonempty enforce item counts', () => {
    expect(schema.array(schema.string()).min(1).parse(['a'])).toEqual(['a'])
    expect(() => schema.array(schema.string()).min(1).parse([])).toThrowError('Array must contain at least 1 item(s)')

    expect(schema.array(schema.string()).max(2).parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(() => schema.array(schema.string()).max(2).parse(['a', 'b', 'c'])).toThrowError('Array must contain at most 2 item(s)')

    expect(schema.array(schema.string()).length(2).parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(() => schema.array(schema.string()).length(2).parse(['a'])).toThrowError('Array must contain exactly 2 item(s)')

    expect(schema.array(schema.string()).nonempty().parse(['a'])).toEqual(['a'])
    expect(() => schema.array(schema.string()).nonempty().parse([])).toThrowError('Array must not be empty')
  })

  test('array constraint methods preserve the item type in chains', () => {
    const ids = schema.array(schema.string()).min(1).max(10)
    expect(ids.parse(['a', 'b'])).toEqual(['a', 'b'])
  })

  test('constraints integrate with object schema fields', () => {
    const userSchema = schema.object({
      email: schema.string().email(),
      tags: schema.array(schema.string()).min(1),
    })

    expect(userSchema.parse({ email: 'a@b.com', tags: ['x'] })).toEqual({ email: 'a@b.com', tags: ['x'] })
    expect(() => userSchema.parse({ email: 'bad', tags: [] })).toThrowError(SchemaError)
  })
})
