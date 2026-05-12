import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('string built-in constraints', () => {
  test('min / max / length enforce character counts', () => {
    const [e1, v1] = schema.string().min(3).parse('abc')
    expect(e1).toBeNull()
    expect(v1).toBe('abc')

    const [e2] = schema.string().min(3).parse('ab')
    expect(e2).toBeInstanceOf(SchemaError)
    const [e2b] = schema.string().min(3).parse('ab')
    expect(e2b?.message).toContain('String must contain at least 3 character(s)')

    const [e3, v3] = schema.string().max(4).parse('abcd')
    expect(e3).toBeNull()
    expect(v3).toBe('abcd')
    const [e4] = schema.string().max(4).parse('abcde')
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('String must contain at most 4 character(s)')

    const [e5, v5] = schema.string().length(2).parse('ab')
    expect(e5).toBeNull()
    expect(v5).toBe('ab')
    const [e6] = schema.string().length(2).parse('a')
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('String must contain exactly 2 character(s)')
  })

  test('email / url / uuid use sensible defaults and accept custom messages', () => {
    const [e1, v1] = schema.string().email().parse('a@b.com')
    expect(e1).toBeNull()
    expect(v1).toBe('a@b.com')
    const [e2] = schema.string().email().parse('not-an-email')
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Invalid email')

    const [e3, v3] = schema.string().url().parse('https://example.com')
    expect(e3).toBeNull()
    expect(v3).toBe('https://example.com')
    const [e4] = schema.string().url().parse('not a url')
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('Invalid url')

    const [e5, v5] = schema.string().uuid().parse('123e4567-e89b-42d3-a456-426614174000')
    expect(e5).toBeNull()
    expect(v5).toBe('123e4567-e89b-42d3-a456-426614174000')
    const [e6] = schema.string().uuid().parse('zzz')
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('Invalid UUID')

    const [e7] = schema.string().email('bad email').parse('no')
    expect(e7).toBeInstanceOf(SchemaError)
    expect(e7?.message).toContain('bad email')
  })

  test('regex / startsWith / endsWith compose with other refinements', () => {
    const slug = schema.string().regex(/^[a-z0-9-]+$/, 'must be slug')
    const [e1, v1] = slug.parse('hello-world')
    expect(e1).toBeNull()
    expect(v1).toBe('hello-world')
    const [e2] = slug.parse('NOT_OK')
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('must be slug')

    const userId = schema.string().startsWith('u_').min(3)
    const [e3, v3] = userId.parse('u_abc')
    expect(e3).toBeNull()
    expect(v3).toBe('u_abc')
    const [e4] = userId.parse('a')
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('String must start with "u_"')

    const [e5, v5] = schema.string().endsWith('.png').parse('cover.png')
    expect(e5).toBeNull()
    expect(v5).toBe('cover.png')
    const [e6] = schema.string().endsWith('.png').parse('cover.jpg')
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('String must end with ".png"')
  })

  test('chained string methods continue to expose StringSchemaMethods', () => {
    const [err, result] = schema
      .string()
      .min(3)
      .max(8)
      .regex(/^[a-z]+$/i)
      .parse('abcd')
    expect(err).toBeNull()
    expect(result).toBe('abcd')
  })
})

describe('number built-in constraints', () => {
  test('min / max / gt / lt act as inclusive and exclusive bounds', () => {
    const [e1, v1] = schema.number().min(0).max(100).parse(50)
    expect(e1).toBeNull()
    expect(v1).toBe(50)
    const [e2, v2] = schema.number().min(0).max(100).parse(0)
    expect(e2).toBeNull()
    expect(v2).toBe(0)
    const [e3, v3] = schema.number().min(0).max(100).parse(100)
    expect(e3).toBeNull()
    expect(v3).toBe(100)

    const [e4] = schema.number().min(0).max(100).parse(-1)
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('Number must be greater than or equal to 0')

    const [e5] = schema.number().min(0).max(100).parse(101)
    expect(e5).toBeInstanceOf(SchemaError)
    expect(e5?.message).toContain('Number must be less than or equal to 100')

    const [e6] = schema.number().gt(0).parse(0)
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('Number must be greater than 0')

    const [e7] = schema.number().lt(10).parse(10)
    expect(e7).toBeInstanceOf(SchemaError)
    expect(e7?.message).toContain('Number must be less than 10')
  })

  test('int / positive / negative / multipleOf cover common shape checks', () => {
    const [e1, v1] = schema.number().int().parse(7)
    expect(e1).toBeNull()
    expect(v1).toBe(7)
    const [e2] = schema.number().int().parse(3.14)
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Number must be an integer')

    const [e3, v3] = schema.number().positive().parse(1)
    expect(e3).toBeNull()
    expect(v3).toBe(1)
    const [e4] = schema.number().positive().parse(0)
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('Number must be positive')

    const [e5, v5] = schema.number().negative().parse(-1)
    expect(e5).toBeNull()
    expect(v5).toBe(-1)
    const [e6] = schema.number().negative().parse(0)
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('Number must be negative')

    const [e7, v7] = schema.number().nonnegative().parse(0)
    expect(e7).toBeNull()
    expect(v7).toBe(0)
    const [e8] = schema.number().nonnegative().parse(-1)
    expect(e8).toBeInstanceOf(SchemaError)
    expect(e8?.message).toContain('Number must be non-negative')

    const [e9, v9] = schema.number().nonpositive().parse(0)
    expect(e9).toBeNull()
    expect(v9).toBe(0)
    const [e10] = schema.number().nonpositive().parse(1)
    expect(e10).toBeInstanceOf(SchemaError)
    expect(e10?.message).toContain('Number must be non-positive')

    const [e11, v11] = schema.number().multipleOf(5).parse(15)
    expect(e11).toBeNull()
    expect(v11).toBe(15)
    const [e12] = schema.number().multipleOf(5).parse(7)
    expect(e12).toBeInstanceOf(SchemaError)
    expect(e12?.message).toContain('Number must be a multiple of 5')
  })

  test('finite rejects NaN-poisoned literals via schema chain', () => {
    const [e1, v1] = schema.number().finite().parse(42)
    expect(e1).toBeNull()
    expect(v1).toBe(42)
    const [e2] = schema.number().finite().parse(Number.POSITIVE_INFINITY)
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Number must be finite')
  })

  test('gte / lte are inclusive aliases of min / max', () => {
    const [e1, v1] = schema.number().gte(10).parse(10)
    expect(e1).toBeNull()
    expect(v1).toBe(10)
    const [e2] = schema.number().gte(10).parse(9)
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Number must be greater than or equal to 10')

    const [e3, v3] = schema.number().lte(10).parse(10)
    expect(e3).toBeNull()
    expect(v3).toBe(10)
    const [e4] = schema.number().lte(10).parse(11)
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('Number must be less than or equal to 10')
  })
})

describe('array built-in constraints', () => {
  test('min / max / length / nonempty enforce item counts', () => {
    const [e1, v1] = schema.array(schema.string()).min(1).parse(['a'])
    expect(e1).toBeNull()
    expect(v1).toEqual(['a'])
    const [e2] = schema.array(schema.string()).min(1).parse([])
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Array must contain at least 1 item(s)')

    const [e3, v3] = schema.array(schema.string()).max(2).parse(['a', 'b'])
    expect(e3).toBeNull()
    expect(v3).toEqual(['a', 'b'])
    const [e4] = schema.array(schema.string()).max(2).parse(['a', 'b', 'c'])
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('Array must contain at most 2 item(s)')

    const [e5, v5] = schema.array(schema.string()).length(2).parse(['a', 'b'])
    expect(e5).toBeNull()
    expect(v5).toEqual(['a', 'b'])
    const [e6] = schema.array(schema.string()).length(2).parse(['a'])
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('Array must contain exactly 2 item(s)')

    const [e7, v7] = schema.array(schema.string()).nonempty().parse(['a'])
    expect(e7).toBeNull()
    expect(v7).toEqual(['a'])
    const [e8] = schema.array(schema.string()).nonempty().parse([])
    expect(e8).toBeInstanceOf(SchemaError)
    expect(e8?.message).toContain('Array must not be empty')
  })

  test('array constraint methods preserve the item type in chains', () => {
    const ids = schema.array(schema.string()).min(1).max(10)
    const [err, val] = ids.parse(['a', 'b'])
    expect(err).toBeNull()
    expect(val).toEqual(['a', 'b'])
  })

  test('constraints integrate with object schema fields', () => {
    const userSchema = schema.object({
      email: schema.string().email(),
      tags: schema.array(schema.string()).min(1),
    })

    const [okErr, okVal] = userSchema.parse({ email: 'a@b.com', tags: ['x'] })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({ email: 'a@b.com', tags: ['x'] })

    const [badErr] = userSchema.parse({ email: 'bad', tags: [] })
    expect(badErr).toBeInstanceOf(SchemaError)
  })
})
