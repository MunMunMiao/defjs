import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'

describe('constructors.ts bigint and date primitives', () => {
  test('bigint accepts BigInt and string wire form, rejects number', () => {
    const [e1, v1] = struct.bigint().parse(42n)
    if (e1) {
      throw e1
    }
    expect(v1).toBe(42n)

    const [e2, v2] = struct.bigint().parse('42')
    if (e2) {
      throw e2
    }
    expect(v2).toBe(42n)

    const [e3, v3] = struct.bigint().parse('9007199254740993')
    if (e3) {
      throw e3
    }
    expect(v3).toBe(9007199254740993n)

    const [e4, v4] = struct.bigint().parse(undefined)
    if (e4) {
      throw e4
    }
    expect(v4).toBe(0n)

    const [e5] = struct.bigint().parse(42)
    expect(e5).toBeInstanceOf(StructError)
    expect(e5?.message).toContain('Expected bigint')

    const [e6] = struct.bigint().parse('abc')
    expect(e6).toBeInstanceOf(StructError)
    expect(e6?.message).toContain('Expected bigint')
  })

  test('bigint encodes back to string wire form', () => {
    expect(struct.bigint().encode(42n)).toBe('42')
    const [err, parsed] = struct.bigint().parse('9007199254740993')
    if (err) {
      throw err
    }
    expect(struct.bigint().encode(parsed as bigint)).toBe('9007199254740993')
  })

  test('date accepts Date instance, ISO string, and epoch number', () => {
    const d = new Date('2026-05-12T10:00:00Z')
    const [e1, v1] = struct.date().parse(d)
    if (e1) {
      throw e1
    }
    expect(v1).toBe(d)

    const [e2, v2] = struct.date().parse('2026-05-12T10:00:00Z')
    if (e2) {
      throw e2
    }
    expect((v2 as Date).getTime()).toBe(d.getTime())

    const [e3, v3] = struct.date().parse(d.getTime())
    if (e3) {
      throw e3
    }
    expect((v3 as Date).getTime()).toBe(d.getTime())

    const [e4, zero] = struct.date().parse(undefined)
    if (e4) {
      throw e4
    }
    expect(zero).toBeInstanceOf(Date)
    expect((zero as Date).getTime()).toBe(0)
  })

  test('date rejects invalid wire input with invalid_type code', () => {
    const [e1] = struct.date().parse(new Date('not-a-date'))
    expect(e1).toBeInstanceOf(StructError)
    expect(e1?.message).toContain('Expected Date')
    expect(e1?.issues[0]?.code).toBe('invalid_type')

    const [e2] = struct.date().parse('not-a-date')
    expect(e2).toBeInstanceOf(StructError)
    expect(e2?.message).toContain('Expected Date')
    expect(e2?.issues[0]?.code).toBe('invalid_type')

    const [e3] = struct.date().parse(true)
    expect(e3).toBeInstanceOf(StructError)
    expect(e3?.message).toContain('Expected Date')
  })

  test('date encodes back to ISO string', () => {
    const d = new Date('2026-05-12T10:00:00Z')
    expect(struct.date().encode(d)).toBe('2026-05-12T10:00:00.000Z')
    const [err, parsed] = struct.date().parse('2026-05-12T10:00:00Z')
    if (err) {
      throw err
    }
    expect(struct.date().encode(parsed as Date)).toBe('2026-05-12T10:00:00.000Z')
  })
})

describe('constructors.ts intersection', () => {
  test('intersection merges two object schemas field-wise', () => {
    const named = struct.object({ name: struct.string() })
    const aged = struct.object({ age: struct.number() })
    const person = struct.intersection(named, aged)

    const [okErr, okVal] = person.parse({ name: 'x', age: 30 })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ name: 'x', age: 30 })

    const [badErr] = person.parse({ name: 'x', age: 'bad' })
    expect(badErr).toBeInstanceOf(StructError)
  })

  test('intersection rejects when either side fails', () => {
    const combined = struct.intersection(struct.object({ name: struct.string() }), struct.object({ age: struct.number() }))

    const [okErr, okVal] = combined.parse({ age: 7, name: 'Miao' })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ age: 7, name: 'Miao' })

    const [leftErr] = combined.parse({ age: 7, name: false })
    expect(leftErr).toBeInstanceOf(StructError)
    expect(leftErr?.message).toContain('Expected string')

    const [rightErr] = combined.parse({ age: 'bad', name: 'Miao' })
    expect(rightErr).toBeInstanceOf(StructError)
    expect(rightErr?.message).toContain('Expected number')
  })
})
