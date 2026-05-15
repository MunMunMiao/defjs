import { describe, expect, test } from 'vitest'
import { struct } from './index'

function encodeUnsafe(schema: unknown, value: unknown): unknown {
  return (schema as { encode(value: unknown): unknown }).encode(value)
}

describe('encode.ts', () => {
  test('encode is identity for primitives', () => {
    expect(struct.string().encode('hello')).toBe('hello')
    expect(struct.number().encode(42)).toBe(42)
    expect(struct.boolean().encode(true)).toBe(true)
  })

  test('encode follows getter-recursive object schemas', () => {
    const tree = struct.object({
      id: struct.string(),
      get children() {
        return struct.array(tree)
      },
    })

    expect(tree.encode({ id: 'root', children: [{ id: 'a', children: [] }] })).toEqual({
      children: [{ children: [], id: 'a' }],
      id: 'root',
    })
  })

  test('struct.or encodes via first matching option(date vs string)', () => {
    const s = struct.or(struct.date(), struct.string())
    expect(s.encode(new Date('2026-05-12T10:00:00Z'))).toBe('2026-05-12T10:00:00.000Z')
    expect(s.encode('hello')).toBe('hello')
  })

  test('struct.or encodes via first matching option(bigint vs number)', () => {
    const s = struct.or(struct.bigint(), struct.number())
    expect(s.encode(42n)).toBe('42')
    expect(s.encode(3.14)).toBe(3.14)
  })

  test('struct.discriminatedUnion encodes via discriminator', () => {
    const s = struct.discriminatedUnion('type', [
      struct.object({ type: struct.literal('a'), payload: struct.date() }),
      struct.object({ type: struct.literal('b'), payload: struct.bigint() }),
    ])
    const aEncoded = s.encode({ type: 'a', payload: new Date('2026-05-12T10:00:00Z') }) as { type: string; payload: string }
    expect(aEncoded.payload).toBe('2026-05-12T10:00:00.000Z')

    const bEncoded = s.encode({ type: 'b', payload: 42n }) as { type: string; payload: string }
    expect(bEncoded.payload).toBe('42')
  })

  test('struct.intersection encodes via right side', () => {
    const named = struct.object({ name: struct.string() })
    const dated = struct.object({ when: struct.date() })
    const s = struct.intersection(named, dated)
    const encoded = s.encode({ name: 'x', when: new Date('2026-05-12T10:00:00Z') }) as { name: string; when: string }
    expect(encoded.when).toBe('2026-05-12T10:00:00.000Z')
  })

  test('round-trip wire form stable through or codec', () => {
    const s = struct.or(struct.date(), struct.string())
    const [err, val] = s.parse('2026-05-12T10:00:00Z')
    if (err) {
      throw err
    }
    expect(s.encode(val)).toBe('2026-05-12T10:00:00.000Z')
  })

  test('round-trip wire form stable through discriminatedUnion codec', () => {
    const s = struct.discriminatedUnion('type', [struct.object({ type: struct.literal('a'), payload: struct.bigint() })])
    const [err, val] = s.parse({ type: 'a', payload: '42' })
    if (err) {
      throw err
    }
    const encoded = s.encode(val) as { type: string; payload: string }
    expect(encoded.payload).toBe('42')
  })

  test('struct.or encodes via blob, file, arrayBuffer, boolean, null branches', () => {
    const s = struct.or(struct.blob(), struct.file(), struct.arrayBuffer(), struct.boolean(), struct.null())
    expect(s.encode(new Blob(['x']))).toBeInstanceOf(Blob)
    expect(s.encode(new File([], 'x'))).toBeInstanceOf(File)
    expect(s.encode(new ArrayBuffer(1))).toBeInstanceOf(ArrayBuffer)
    expect(s.encode(true)).toBe(true)
    expect(s.encode(null)).toBeNull()
  })

  test('struct.or encodes via tuple, array, record, object branches', () => {
    const s = struct.or(
      struct.tuple([struct.string()]),
      struct.array(struct.string()),
      struct.record(struct.string()),
      struct.object({ name: struct.string() }),
    )
    expect(s.encode(['a'])).toEqual(['a'])
    expect(s.encode(['a', 'b'])).toEqual(['a', 'b'])
    expect(s.encode({ key: 'x' })).toEqual({ key: 'x' })
    expect(s.encode({ name: 'x' })).toEqual({ name: 'x' })
  })

  test('nested or discriminatedUnion and intersection encode via matchesDefinition', () => {
    const nestedOr = struct.or(struct.or(struct.date(), struct.string()), struct.number())
    expect(nestedOr.encode(new Date('2026-05-12T10:00:00Z'))).toBe('2026-05-12T10:00:00.000Z')
    expect(nestedOr.encode('hello')).toBe('hello')
    expect(nestedOr.encode(42)).toBe(42)

    const nestedDisc = struct.or(
      struct.discriminatedUnion('type', [struct.object({ type: struct.literal('a'), payload: struct.bigint() })]),
      struct.string(),
    )
    expect(nestedDisc.encode({ type: 'a', payload: 42n })).toEqual({ type: 'a', payload: '42' })

    const nestedAny = struct.or(struct.any(), struct.number())
    expect(nestedAny.encode('anything')).toBe('anything')

    const nestedUnknown = struct.or(struct.unknown(), struct.number())
    expect(nestedUnknown.encode('unknown')).toBe('unknown')

    const nestedLiteral = struct.or(struct.literal('x'), struct.number())
    expect(nestedLiteral.encode('x')).toBe('x')

    const nestedInt = struct.or(
      struct.intersection(struct.object({ name: struct.string() }), struct.object({ when: struct.string() })),
      struct.number(),
    )
    expect(nestedInt.encode({ name: 'x', when: 'y' })).toEqual({
      when: 'y',
    })
  })

  test('struct.or falls through when no option matches', () => {
    const s = struct.or(struct.number(), struct.string())
    expect(encodeUnsafe(s, true)).toBe(true)
  })

  test('struct.discriminatedUnion falls through when no match', () => {
    const s = struct.discriminatedUnion('type', [struct.object({ type: struct.literal('a'), payload: struct.string() })])
    expect(encodeUnsafe(s, 'not an object')).toBe('not an object')
    expect(encodeUnsafe(s, { type: 'b' })).toEqual({ type: 'b' })
  })

  test('struct.object encode skips missing keys and non-objects in union', () => {
    const s = struct.object({ name: struct.string(), age: struct.number().optional() })
    expect(s.encode({ name: 'x' })).toEqual({ name: 'x' })

    const union = struct.or(s, struct.number())
    expect(union.encode(42)).toBe(42)
  })

  test('struct.record encode returns non-plain-object as-is', () => {
    const s = struct.record(struct.string())
    expect(encodeUnsafe(s, 42)).toBe(42)
    expect(encodeUnsafe(s, null)).toBeNull()
  })

  test('struct.object encode returns non-plain-object as-is', () => {
    const s = struct.object({ name: struct.string() })
    expect(encodeUnsafe(s, 42)).toBe(42)
    expect(encodeUnsafe(s, null)).toBeNull()
  })

  test('struct.enum in or falls through when value does not match', () => {
    const s = struct.or(struct.enum(['a', 'b']), struct.number())
    expect(encodeUnsafe(s, 'c')).toBe('c')
  })
})
