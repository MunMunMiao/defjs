import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema brand (nominal types)', () => {
  test('brand is a runtime no-op preserving the value', () => {
    const userId = schema.string().brand<'UserId'>()
    expect(userId.parse('u_1')).toBe('u_1')
  })
})

describe('schema catch (fallback on failure)', () => {
  test('catch returns fallback when parse fails', () => {
    const positive = schema
      .number()
      .refine(value => value > 0 || 'must be positive')
      .catch(0)

    expect(positive.parse(5)).toBe(5)
    expect(positive.parse(-1)).toBe(0)
  })

  test('catch propagates through object fields', () => {
    const settings = schema.object({
      retries: schema.number().int().catch(3),
    })

    expect(settings.parse({ retries: 5 })).toEqual({ retries: 5 })
    expect(settings.parse({ retries: 'bad' })).toEqual({ retries: 3 })
  })

  test('catch clones fallback to avoid shared reference mutation', () => {
    const list = schema.array(schema.number()).catch([1, 2])

    const a = list.parse('bad') as number[]
    const b = list.parse('also-bad') as number[]
    a.push(99)
    expect(b).toEqual([1, 2])
  })

  test('safeParse with catch returns ok=true even on bad input', () => {
    const enriched = schema.string().min(3).catch('default')
    const result = enriched.safeParse('a')
    expect(result).toEqual({ ok: true, value: 'default' })
  })
})

describe('schema lazy (explicit recursive)', () => {
  test('lazy resolver is invoked on parse, supporting recursive schemas', () => {
    const tree: any = schema.object({
      id: schema.string(),
      children: schema.array(schema.lazy(() => tree)),
    })

    expect(
      tree.parse({
        id: 'root',
        children: [
          { id: 'a', children: [] },
          { id: 'b', children: [{ id: 'c', children: [] }] },
        ],
      }),
    ).toEqual({
      id: 'root',
      children: [
        { id: 'a', children: [] },
        { id: 'b', children: [{ id: 'c', children: [] }] },
      ],
    })
  })

  test('lazy resolver is memoized across calls', () => {
    let calls = 0
    const innerSchema = schema.string()
    const wrapped = schema.lazy(() => {
      calls += 1
      return innerSchema
    })

    wrapped.parse('a')
    wrapped.parse('b')
    wrapped.parse('c')
    expect(calls).toBe(1)
  })

  test('lazy rejects non-function resolvers at chain time', () => {
    expect(() => schema.lazy(null as never)).toThrowError('lazy() requires a resolver function')
  })
})

describe('schema bigint and date primitives', () => {
  test('bigint validates BigInt values and exposes a 0n zero value', () => {
    expect(schema.bigint().parse(42n)).toBe(42n)
    expect(schema.bigint().parse(undefined)).toBe(0n)
    expect(() => schema.bigint().parse(42)).toThrowError('Expected bigint at <root>, received 42')
  })

  test('date validates Date instances, rejects invalid dates', () => {
    const d = new Date('2026-05-12')
    expect(schema.date().parse(d)).toBe(d)
    expect(() => schema.date().parse(new Date('not-a-date'))).toThrowError('Expected Date')
    expect(() => schema.date().parse('2026-05-12')).toThrowError('Expected Date')

    const zero = schema.date().parse(undefined)
    expect(zero).toBeInstanceOf(Date)
    expect((zero as Date).getTime()).toBe(0)
  })
})

describe('schema intersection', () => {
  test('intersection merges two object schemas field-wise', () => {
    const named = schema.object({ name: schema.string() })
    const aged = schema.object({ age: schema.number() })
    const person = schema.intersection(named, aged)

    expect(person.parse({ name: 'x', age: 30 })).toEqual({ name: 'x', age: 30 })
    expect(() => person.parse({ name: 'x', age: 'bad' })).toThrowError(SchemaError)
  })

  test('intersection rejects when either side fails', () => {
    const positive = schema.number().refine(value => value > 0 || 'must be positive')
    const integer = schema.number().int()
    const combined = schema.intersection(positive, integer)

    expect(combined.parse(7)).toBe(7)
    expect(() => combined.parse(-1)).toThrowError('must be positive')
    expect(() => combined.parse(3.14)).toThrowError('Number must be an integer')
  })
})

describe('schema string regex extensions', () => {
  test('datetime accepts ISO 8601 with offset / Z', () => {
    expect(schema.string().datetime().parse('2026-05-12T08:30:00Z')).toBe('2026-05-12T08:30:00Z')
    expect(schema.string().datetime().parse('2026-05-12T08:30:00.123+08:00')).toBe('2026-05-12T08:30:00.123+08:00')
    expect(() => schema.string().datetime().parse('2026-05-12')).toThrowError('Invalid ISO datetime')
  })

  test('ip accepts IPv4 and IPv6', () => {
    expect(schema.string().ip().parse('192.168.0.1')).toBe('192.168.0.1')
    expect(schema.string().ip().parse('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe('2001:0db8:0000:0000:0000:ff00:0042:8329')
    expect(() => schema.string().ip().parse('999.999.999.999')).toThrowError('Invalid IP address')
  })

  test('cuid and nanoid validate fixed-shape ids', () => {
    expect(schema.string().cuid().parse('c123456789012345678901234')).toBe('c123456789012345678901234')
    expect(() => schema.string().cuid().parse('not-cuid')).toThrowError('Invalid CUID')

    expect(schema.string().nanoid().parse('V1StGXR8_Z5jdHi6B-myT')).toBe('V1StGXR8_Z5jdHi6B-myT')
    expect(() => schema.string().nanoid().parse('short')).toThrowError('Invalid nanoid')
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

    expect(() => strictUser.parse({})).toThrowError('Missing key "id"')

    expect(strictUser.parse({ id: 'u_1' })).toEqual({ id: 'u_1', locale: 'zh-CN' })
  })

  test('strict({ missingKeys: true, unknownKeys: false }) only checks missing, allows unknowns', () => {
    const partial = user.strict({ missingKeys: true, unknownKeys: false })
    expect(partial.parse({ id: 'u_1', extra: 'ok' })).toEqual({ id: 'u_1', locale: 'zh-CN' })
    expect(() => partial.parse({ extra: 'ok' })).toThrowError('Missing key "id"')
  })

  test('default .strict() still enforces unknownKeys only', () => {
    const u = user.strict()
    expect(u.parse({ id: 'u_1' })).toEqual({ id: 'u_1', locale: 'zh-CN' })
    expect(() => u.parse({ id: 'u_1', extra: 'no' })).toThrowError('Unrecognized key')
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

  test('encode follows lazy resolver', () => {
    const tree: any = schema.object({
      id: schema.string().alias('node_id'),
      children: schema.array(schema.lazy(() => tree)),
    })

    expect(tree.encode({ id: 'root', children: [{ id: 'a', children: [] }] })).toEqual({
      node_id: 'root',
      children: [{ node_id: 'a', children: [] }],
    })
  })
})
