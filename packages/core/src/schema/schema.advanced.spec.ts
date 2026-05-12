import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema brand (nominal types)', () => {
  test('brand is a runtime no-op preserving the value', () => {
    const userId = schema.string().brand<'UserId'>()
    const [err, val] = userId.parse('u_1')
    expect(err).toBeNull()
    expect(val).toBe('u_1')
  })
})

describe('schema catch (fallback on failure)', () => {
  test('catch returns fallback when parse fails', () => {
    const positive = schema
      .number()
      .refine(value => value > 0 || 'must be positive')
      .catch(0)

    const [err1, val1] = positive.parse(5)
    expect(err1).toBeNull()
    expect(val1).toBe(5)

    const [err2, val2] = positive.parse(-1)
    expect(err2).toBeNull()
    expect(val2).toBe(0)
  })

  test('catch propagates through object fields', () => {
    const settings = schema.object({
      retries: schema.number().int().catch(3),
    })

    const [err1, val1] = settings.parse({ retries: 5 })
    expect(err1).toBeNull()
    expect(val1).toEqual({ retries: 5 })

    const [err2, val2] = settings.parse({ retries: 'bad' })
    expect(err2).toBeNull()
    expect(val2).toEqual({ retries: 3 })
  })

  test('catch clones fallback to avoid shared reference mutation', () => {
    const list = schema.array(schema.number()).catch([1, 2])

    const [, a] = list.parse('bad')
    const [, b] = list.parse('also-bad')
    ;(a as number[]).push(99)
    expect(b).toEqual([1, 2])
  })

  test('parse with catch returns fallback even on bad input', () => {
    const enriched = schema.string().min(3).catch('default')
    const [err, val] = enriched.parse('a')
    expect(err).toBeNull()
    expect(val).toBe('default')
  })
})

describe('schema object with getter (recursive shape)', () => {
  test('object schema parses recursive structure via getter field', () => {
    const tree = schema.object({
      id: schema.string(),
      get children() {
        return schema.array(tree)
      },
    })

    const [err, val] = tree.parse({
      id: 'root',
      children: [
        { id: 'a', children: [] },
        { id: 'b', children: [{ id: 'c', children: [] }] },
      ],
    })
    expect(err).toBeNull()
    expect(val).toEqual({
      id: 'root',
      children: [
        { id: 'a', children: [] },
        { id: 'b', children: [{ id: 'c', children: [] }] },
      ],
    })
  })

  test('object schema asserts non-schema fields at runtime', () => {
    const bad = schema.object({ x: 42 as never })
    expect(() => bad.parse({ x: 1 })).toThrowError(/must be a schema/)
  })
})

describe('schema bigint and date primitives', () => {
  test('bigint accepts BigInt and string wire form, rejects number', () => {
    const [e1, v1] = schema.bigint().parse(42n)
    expect(e1).toBeNull()
    expect(v1).toBe(42n)

    const [e2, v2] = schema.bigint().parse('42')
    expect(e2).toBeNull()
    expect(v2).toBe(42n)

    const [e3, v3] = schema.bigint().parse('9007199254740993')
    expect(e3).toBeNull()
    expect(v3).toBe(9007199254740993n)

    const [e4, v4] = schema.bigint().parse(undefined)
    expect(e4).toBeNull()
    expect(v4).toBe(0n)

    const [e5] = schema.bigint().parse(42)
    expect(e5).toBeInstanceOf(SchemaError)
    expect(e5?.message).toContain('Expected bigint')

    const [e6] = schema.bigint().parse('abc')
    expect(e6).toBeInstanceOf(SchemaError)
    expect(e6?.message).toContain('Expected bigint')
  })

  test('bigint encodes back to string wire form', () => {
    expect(schema.bigint().encode(42n)).toBe('42')
    const [, parsed] = schema.bigint().parse('9007199254740993')
    expect(schema.bigint().encode(parsed as bigint)).toBe('9007199254740993')
  })

  test('date accepts Date instance, ISO string, and epoch number', () => {
    const d = new Date('2026-05-12T10:00:00Z')
    const [e1, v1] = schema.date().parse(d)
    expect(e1).toBeNull()
    expect(v1).toBe(d)

    const [e2, v2] = schema.date().parse('2026-05-12T10:00:00Z')
    expect(e2).toBeNull()
    expect((v2 as Date).getTime()).toBe(d.getTime())

    const [e3, v3] = schema.date().parse(d.getTime())
    expect(e3).toBeNull()
    expect((v3 as Date).getTime()).toBe(d.getTime())

    const [e4, zero] = schema.date().parse(undefined)
    expect(e4).toBeNull()
    expect(zero).toBeInstanceOf(Date)
    expect((zero as Date).getTime()).toBe(0)
  })

  test('date rejects invalid wire input with invalid_type code', () => {
    const [e1] = schema.date().parse(new Date('not-a-date'))
    expect(e1).toBeInstanceOf(SchemaError)
    expect(e1?.message).toContain('Expected Date')
    expect(e1?.issues[0]?.code).toBe('invalid_type')

    const [e2] = schema.date().parse('not-a-date')
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Expected Date')
    expect(e2?.issues[0]?.code).toBe('invalid_type')
  })

  test('date encodes back to ISO string', () => {
    const d = new Date('2026-05-12T10:00:00Z')
    expect(schema.date().encode(d)).toBe('2026-05-12T10:00:00.000Z')
    const [, parsed] = schema.date().parse('2026-05-12T10:00:00Z')
    expect(schema.date().encode(parsed as Date)).toBe('2026-05-12T10:00:00.000Z')
  })
})

describe('schema intersection', () => {
  test('intersection merges two object schemas field-wise', () => {
    const named = schema.object({ name: schema.string() })
    const aged = schema.object({ age: schema.number() })
    const person = schema.intersection(named, aged)

    const [okErr, okVal] = person.parse({ name: 'x', age: 30 })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({ name: 'x', age: 30 })

    const [badErr] = person.parse({ name: 'x', age: 'bad' })
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('intersection rejects when either side fails', () => {
    const positive = schema.number().refine(value => value > 0 || 'must be positive')
    const integer = schema.number().int()
    const combined = schema.intersection(positive, integer)

    const [okErr, okVal] = combined.parse(7)
    expect(okErr).toBeNull()
    expect(okVal).toBe(7)

    const [negErr] = combined.parse(-1)
    expect(negErr).toBeInstanceOf(SchemaError)
    expect(negErr?.message).toContain('must be positive')

    const [floatErr] = combined.parse(3.14)
    expect(floatErr).toBeInstanceOf(SchemaError)
    expect(floatErr?.message).toContain('Number must be an integer')
  })
})

describe('schema string regex extensions', () => {
  test('datetime accepts ISO 8601 with offset / Z', () => {
    const [e1, v1] = schema.string().datetime().parse('2026-05-12T08:30:00Z')
    expect(e1).toBeNull()
    expect(v1).toBe('2026-05-12T08:30:00Z')

    const [e2, v2] = schema.string().datetime().parse('2026-05-12T08:30:00.123+08:00')
    expect(e2).toBeNull()
    expect(v2).toBe('2026-05-12T08:30:00.123+08:00')

    const [e3] = schema.string().datetime().parse('2026-05-12')
    expect(e3).toBeInstanceOf(SchemaError)
    expect(e3?.message).toContain('Invalid ISO datetime')
  })

  test('ip accepts IPv4 and IPv6', () => {
    const [e1, v1] = schema.string().ip().parse('192.168.0.1')
    expect(e1).toBeNull()
    expect(v1).toBe('192.168.0.1')

    const [e2, v2] = schema.string().ip().parse('2001:0db8:0000:0000:0000:ff00:0042:8329')
    expect(e2).toBeNull()
    expect(v2).toBe('2001:0db8:0000:0000:0000:ff00:0042:8329')

    const [e3] = schema.string().ip().parse('999.999.999.999')
    expect(e3).toBeInstanceOf(SchemaError)
    expect(e3?.message).toContain('Invalid IP address')
  })

  test('cuid and nanoid validate fixed-shape ids', () => {
    const [e1, v1] = schema.string().cuid().parse('c123456789012345678901234')
    expect(e1).toBeNull()
    expect(v1).toBe('c123456789012345678901234')

    const [e2] = schema.string().cuid().parse('not-cuid')
    expect(e2).toBeInstanceOf(SchemaError)
    expect(e2?.message).toContain('Invalid CUID')

    const [e3, v3] = schema.string().nanoid().parse('V1StGXR8_Z5jdHi6B-myT')
    expect(e3).toBeNull()
    expect(v3).toBe('V1StGXR8_Z5jdHi6B-myT')

    const [e4] = schema.string().nanoid().parse('short')
    expect(e4).toBeInstanceOf(SchemaError)
    expect(e4?.message).toContain('Invalid nanoid')
  })
})

describe('schema strict missingKeys (Go strict mode)', () => {
  const user = schema.object({
    id: schema.string(),
    nickname: schema.string().optional(),
    locale: schema.string().default('zh-CN'),
  })

  test('strict({ missingKeys: true }) rejects missing required fields', () => {
    const strictUser = user.strict({ missingKeys: true })

    const [missErr] = strictUser.parse({})
    expect(missErr).toBeInstanceOf(SchemaError)
    expect(missErr?.message).toContain('Missing key "id"')

    const [okErr, okVal] = strictUser.parse({ id: 'u_1' })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({ id: 'u_1', locale: 'zh-CN' })
  })

  test('strict({ missingKeys: true, unknownKeys: false }) only checks missing, allows unknowns', () => {
    const partial = user.strict({ missingKeys: true, unknownKeys: false })

    const [okErr, okVal] = partial.parse({ id: 'u_1', extra: 'ok' })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({ id: 'u_1', locale: 'zh-CN' })

    const [missErr] = partial.parse({ extra: 'ok' })
    expect(missErr).toBeInstanceOf(SchemaError)
    expect(missErr?.message).toContain('Missing key "id"')
  })

  test('default .strict() still enforces unknownKeys only', () => {
    const u = user.strict()

    const [okErr, okVal] = u.parse({ id: 'u_1' })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({ id: 'u_1', locale: 'zh-CN' })

    const [unkErr] = u.parse({ id: 'u_1', extra: 'no' })
    expect(unkErr).toBeInstanceOf(SchemaError)
    expect(unkErr?.message).toContain('Unrecognized key')
  })
})

describe('schema encode (Go json.Marshal dual)', () => {
  test('encode rewrites alias keys back to wire form', () => {
    const user = schema.object({
      pageSize: schema.number().alias('page_size'),
      page: schema.number(),
    })

    expect(user.encode({ pageSize: 50, page: 1 })).toEqual({ page_size: 50, page: 1 })
  })

  test('encode recurses into arrays and nested objects', () => {
    const blog = schema.object({
      authorId: schema.string().alias('author_id'),
      tags: schema.array(schema.string()),
    })

    expect(blog.encode({ authorId: 'u_1', tags: ['a', 'b'] })).toEqual({
      author_id: 'u_1',
      tags: ['a', 'b'],
    })
  })

  test('encode is identity for primitives', () => {
    expect(schema.string().encode('hello')).toBe('hello')
    expect(schema.number().encode(42)).toBe(42)
    expect(schema.boolean().encode(true)).toBe(true)
  })

  test('encode follows recursive shape via getter', () => {
    const tree = schema.object({
      id: schema.string().alias('node_id'),
      get children() {
        return schema.array(tree)
      },
    })

    expect(tree.encode({ id: 'root', children: [{ id: 'a', children: [] }] })).toEqual({
      node_id: 'root',
      children: [{ node_id: 'a', children: [] }],
    })
  })
})
