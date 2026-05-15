import { describe, expect, test } from 'vitest'
import { schema } from './index'

describe('encode covers union / intersection / discriminatedUnion(double-codec symmetry)', () => {
  test('schema.or encodes via first matching option(date vs string)', () => {
    const s = schema.or(schema.date(), schema.string())
    expect(s.encode(new Date('2026-05-12T10:00:00Z'))).toBe('2026-05-12T10:00:00.000Z')
    expect(s.encode('hello')).toBe('hello')
  })

  test('schema.or encodes via first matching option(bigint vs number)', () => {
    const s = schema.or(schema.bigint(), schema.number())
    expect(s.encode(42n)).toBe('42')
    expect(s.encode(3.14)).toBe(3.14)
  })

  test('schema.discriminatedUnion encodes via discriminator', () => {
    const s = schema.discriminatedUnion('type', [
      schema.object({ type: schema.literal('a'), payload: schema.date() }),
      schema.object({ type: schema.literal('b'), payload: schema.bigint() }),
    ])
    const aEncoded = s.encode({ type: 'a', payload: new Date('2026-05-12T10:00:00Z') }) as { type: string; payload: string }
    expect(aEncoded.payload).toBe('2026-05-12T10:00:00.000Z')

    const bEncoded = s.encode({ type: 'b', payload: 42n }) as { type: string; payload: string }
    expect(bEncoded.payload).toBe('42')
  })

  test('schema.intersection encodes via right side', () => {
    const named = schema.object({ name: schema.string() })
    const dated = schema.object({ when: schema.date() })
    const s = schema.intersection(named, dated)
    const encoded = s.encode({ name: 'x', when: new Date('2026-05-12T10:00:00Z') }) as { name: string; when: string }
    expect(encoded.when).toBe('2026-05-12T10:00:00.000Z')
  })

  test('round-trip wire form stable through or codec', () => {
    const s = schema.or(schema.date(), schema.string())
    const [, val] = s.parse('2026-05-12T10:00:00Z')
    expect(s.encode(val)).toBe('2026-05-12T10:00:00.000Z')
  })

  test('round-trip wire form stable through discriminatedUnion codec', () => {
    const s = schema.discriminatedUnion('type', [
      schema.object({ type: schema.literal('a'), payload: schema.bigint() }),
    ])
    const [, val] = s.parse({ type: 'a', payload: '42' })
    const encoded = s.encode(val) as { type: string; payload: string }
    expect(encoded.payload).toBe('42')
  })

  test('schema.or encodes via blob, file, arrayBuffer, boolean, null branches', () => {
    const s = schema.or(schema.blob(), schema.file(), schema.arrayBuffer(), schema.boolean(), schema.null())
    expect(s.encode(new Blob(['x']))).toBeInstanceOf(Blob)
    expect(s.encode(new File([], 'x'))).toBeInstanceOf(File)
    expect(s.encode(new ArrayBuffer(1))).toBeInstanceOf(ArrayBuffer)
    expect(s.encode(true)).toBe(true)
    expect(s.encode(null)).toBeNull()
  })

  test('schema.or encodes via tuple, array, record, object branches', () => {
    const s = schema.or(
      schema.tuple([schema.string()]),
      schema.array(schema.string()),
      schema.record(schema.string()),
      schema.object({ name: schema.string() }),
    )
    expect(s.encode(['a'])).toEqual(['a'])
    expect(s.encode(['a', 'b'])).toEqual(['a', 'b'])
    expect(s.encode({ key: 'x' })).toEqual({ key: 'x' })
    expect(s.encode({ name: 'x' })).toEqual({ name: 'x' })
  })

  test('nested or discriminatedUnion and intersection encode via matchesDefinition', () => {
    const nestedOr = schema.or(
      schema.or(schema.date(), schema.string()),
      schema.number(),
    )
    expect(nestedOr.encode(new Date('2026-05-12T10:00:00Z'))).toBe('2026-05-12T10:00:00.000Z')
    expect(nestedOr.encode('hello')).toBe('hello')
    expect(nestedOr.encode(42)).toBe(42)

    const nestedDisc = schema.or(
      schema.discriminatedUnion('type', [
        schema.object({ type: schema.literal('a'), payload: schema.bigint() }),
      ]),
      schema.string(),
    )
    expect(nestedDisc.encode({ type: 'a', payload: 42n })).toEqual({ type: 'a', payload: '42' })

    const nestedAny = schema.or(schema.any(), schema.number())
    expect(nestedAny.encode('anything')).toBe('anything')

    const nestedUnknown = schema.or(schema.unknown(), schema.number())
    expect(nestedUnknown.encode('unknown')).toBe('unknown')

    const nestedLiteral = schema.or(schema.literal('x'), schema.number())
    expect(nestedLiteral.encode('x')).toBe('x')

    const nestedInt = schema.or(
      schema.intersection(
        schema.object({ name: schema.string() }),
        schema.object({ when: schema.string() }),
      ),
      schema.number(),
    )
    expect(nestedInt.encode({ name: 'x', when: 'y' })).toEqual({
      when: 'y',
    })
  })

  test('schema.or falls through when no option matches', () => {
    const s = schema.or(schema.number(), schema.string())
    expect(s.encode(true)).toBe(true)
  })

  test('schema.discriminatedUnion falls through when no match', () => {
    const s = schema.discriminatedUnion('type', [
      schema.object({ type: schema.literal('a'), payload: schema.string() }),
    ])
    expect(s.encode('not an object')).toBe('not an object')
    expect(s.encode({ type: 'b' })).toEqual({ type: 'b' })
  })

  test('schema.object encode skips missing keys and non-objects in union', () => {
    const s = schema.object({ name: schema.string(), age: schema.number().optional() })
    expect(s.encode({ name: 'x' })).toEqual({ name: 'x' })

    const union = schema.or(s, schema.number())
    expect(union.encode(42)).toBe(42)
  })

  test('schema.record encode returns non-plain-object as-is', () => {
    const s = schema.record(schema.string())
    expect(s.encode(42)).toBe(42)
    expect(s.encode(null)).toBeNull()
  })

  test('schema.object encode returns non-plain-object as-is', () => {
    const s = schema.object({ name: schema.string() })
    expect(s.encode(42)).toBe(42)
    expect(s.encode(null)).toBeNull()
  })

  test('schema.enum in or falls through when value does not match', () => {
    const s = schema.or(schema.enum(['a', 'b']), schema.number())
    expect(s.encode('c')).toBe('c')
  })
})
