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
})
