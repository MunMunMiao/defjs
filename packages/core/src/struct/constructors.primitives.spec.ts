import { describe, expect, test } from 'vitest'
import { encodeValue } from './encode'
import { StructError, struct } from './index'
import { parseStructTuple as parse } from './introspection'
import type { RuntimeStruct } from './types'

function encode(struct: unknown, value: unknown): unknown {
  return encodeValue(struct as RuntimeStruct, value)
}

describe('constructors.ts bigint and date primitives', () => {
  test('bigint accepts BigInt and string wire form, rejects number', () => {
    const [e1, v1] = parse(struct.bigint(), 42n)
    if (e1) {
      throw e1
    }
    expect(v1).toBe(42n)

    const [e2, v2] = parse(struct.bigint(), '42')
    if (e2) {
      throw e2
    }
    expect(v2).toBe(42n)

    const [e3, v3] = parse(struct.bigint(), '9007199254740993')
    if (e3) {
      throw e3
    }
    expect(v3).toBe(9007199254740993n)

    const [e4, v4] = parse(struct.bigint(), undefined)
    expect(e4).toBeInstanceOf(StructError)
    expect(v4).toBeUndefined()

    const [e5] = parse(struct.bigint(), 42)
    expect(e5).toBeInstanceOf(StructError)
    expect(e5?.message).toContain('Expected bigint')

    const [e6] = parse(struct.bigint(), 'abc')
    expect(e6).toBeInstanceOf(StructError)
    expect(e6?.message).toContain('Expected bigint')
  })

  test('bigint encodes back to string wire form', () => {
    expect(encode(struct.bigint(), 42n)).toBe('42')
    const [err, parsed] = parse(struct.bigint(), '9007199254740993')
    if (err) {
      throw err
    }
    expect(encode(struct.bigint(), parsed as bigint)).toBe('9007199254740993')
  })

  test('date accepts Date instance, ISO string, and epoch number', () => {
    const d = new Date('2026-05-12T10:00:00Z')
    const [e1, v1] = parse(struct.date(), d)
    if (e1) {
      throw e1
    }
    expect(v1).toBe(d)

    const [e2, v2] = parse(struct.date(), '2026-05-12T10:00:00Z')
    if (e2) {
      throw e2
    }
    expect((v2 as Date).getTime()).toBe(d.getTime())

    const [e3, v3] = parse(struct.date(), d.getTime())
    if (e3) {
      throw e3
    }
    expect((v3 as Date).getTime()).toBe(d.getTime())

    const [e4, value] = parse(struct.date(), undefined)
    expect(e4).toBeInstanceOf(StructError)
    expect(value).toBeUndefined()
  })

  test('date rejects invalid wire input with invalid_type code', () => {
    const [e1] = parse(struct.date(), new Date('not-a-date'))
    expect(e1).toBeInstanceOf(StructError)
    expect(e1?.message).toContain('Expected Date')
    expect(e1?.issues[0]?.code).toBe('invalid_type')

    const [e2] = parse(struct.date(), 'not-a-date')
    expect(e2).toBeInstanceOf(StructError)
    expect(e2?.message).toContain('Expected Date')
    expect(e2?.issues[0]?.code).toBe('invalid_type')

    const [e3] = parse(struct.date(), true)
    expect(e3).toBeInstanceOf(StructError)
    expect(e3?.message).toContain('Expected Date')
  })

  test('date encodes back to ISO string', () => {
    const d = new Date('2026-05-12T10:00:00Z')
    expect(encode(struct.date(), d)).toBe('2026-05-12T10:00:00.000Z')
    const [err, parsed] = parse(struct.date(), '2026-05-12T10:00:00Z')
    if (err) {
      throw err
    }
    expect(encode(struct.date(), parsed as Date)).toBe('2026-05-12T10:00:00.000Z')
  })
})

describe('constructors.ts intersection', () => {
  test('intersection rejects empty struct list at runtime', () => {
    expect(() => (struct.intersection as unknown as (...structs: unknown[]) => unknown)()).toThrow(
      new TypeError('intersection requires at least one struct'),
    )
  })

  test('intersection of one struct is the struct itself', () => {
    const named = struct.object({ name: struct.string() })

    expect(parse(struct.intersection(named), { name: 'x' })).toEqual([null, { name: 'x' }])
  })

  test('intersection merges two object structs field-wise', () => {
    const named = struct.object({ name: struct.string() })
    const aged = struct.object({ age: struct.number() })
    const person = struct.intersection(named, aged)

    const [okErr, okVal] = parse(person, { name: 'x', age: 30 })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ name: 'x', age: 30 })

    const [badErr] = parse(person, { name: 'x', age: 'bad' })
    expect(badErr).toBeInstanceOf(StructError)
  })

  test('nested object intersections flatten into one merge', () => {
    const person = struct.intersection(
      struct.intersection(struct.object({ name: struct.string() }), struct.object({ age: struct.number() })),
      struct.object({ active: struct.boolean() }),
    )

    const [okErr, okVal] = parse(person, { active: true, age: 30, name: 'x' })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ active: true, age: 30, name: 'x' })
  })

  test('intersection merges three object structs field-wise', () => {
    const person = struct.intersection(
      struct.object({ name: struct.string() }),
      struct.object({ age: struct.number() }),
      struct.object({ active: struct.boolean() }),
    )

    const [okErr, okVal] = parse(person, { active: true, age: 30, name: 'x' })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ active: true, age: 30, name: 'x' })

    const [badErr] = parse(person, { active: true, age: 30, name: false })
    expect(badErr).toBeInstanceOf(StructError)
  })

  test('intersection rejects when either side fails', () => {
    const combined = struct.intersection(struct.object({ name: struct.string() }), struct.object({ age: struct.number() }))

    const [okErr, okVal] = parse(combined, { age: 7, name: 'Miao' })
    if (okErr) {
      throw okErr
    }
    expect(okVal).toEqual({ age: 7, name: 'Miao' })

    const [leftErr] = parse(combined, { age: 7, name: false })
    expect(leftErr).toBeInstanceOf(StructError)
    expect(leftErr?.message).toContain('Expected string')

    const [rightErr] = parse(combined, { age: 'bad', name: 'Miao' })
    expect(rightErr).toBeInstanceOf(StructError)
    expect(rightErr?.message).toContain('Expected number')
  })
})
