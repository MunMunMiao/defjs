import { describe, expect, test } from 'vitest'
import { decodeJson, struct, tag } from './index'

describe('parse.ts prototype pollution defense', () => {
  test('parseObjectValue strips __proto__ without polluting Object.prototype', () => {
    const s = struct.object({})
    const [err, val] = s.parse(JSON.parse('{"__proto__":{"polluted":true}}'))
    if (err) {
      throw err
    }
    expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined()
    expect(Object.hasOwn(val as object, '__proto__')).toBe(false)
  })

  test('parseRecordValue does not pollute Object.prototype', () => {
    const s = struct.record(struct.any())
    s.parse(JSON.parse('{"__proto__":{"polluted":true}}'))
    expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  test('parsed object output has null prototype(Object.create(null))', () => {
    const s = struct.object({ x: struct.string() })
    const [err, val] = s.parse({ x: 'hi' })
    if (err) {
      throw err
    }
    expect(Object.getPrototypeOf(val)).toBeNull()
  })

  test('parsed record output has null prototype', () => {
    const s = struct.record(struct.string())
    const [err, val] = s.parse({ k: 'v' })
    if (err) {
      throw err
    }
    expect(Object.getPrototypeOf(val)).toBeNull()
  })

  test('"__proto__" key preserved as own property under record output', () => {
    const s = struct.record(struct.any())
    const [err, val] = s.parse(JSON.parse('{"__proto__":"data"}'))
    if (err) {
      throw err
    }
    expect(Object.hasOwn(val as object, '__proto__')).toBe(true)
    expect((val as Record<string, unknown>)['__proto__']).toBe('data')
  })

  test('parseObjectValue ignores inherited declared fields', () => {
    const s = struct.object({ pollutedId: struct.string() })
    Object.defineProperty(Object.prototype, 'pollutedId', {
      configurable: true,
      value: 'admin',
    })

    try {
      const [err, val] = s.parse({})
      if (err) {
        throw err
      }

      expect(val).toEqual({ pollutedId: '' })
    } finally {
      delete (Object.prototype as Record<string, unknown>)['pollutedId']
    }
  })

  test('parseObjectValueAsync ignores inherited declared fields', async () => {
    const s = struct.object({ pollutedId: struct.string() })
    Object.defineProperty(Object.prototype, 'pollutedId', {
      configurable: true,
      value: 'admin',
    })

    try {
      const [err, val] = await s.parseAsync({})
      if (err) {
        throw err
      }

      expect(val).toEqual({ pollutedId: '' })
    } finally {
      delete (Object.prototype as Record<string, unknown>)['pollutedId']
    }
  })

  test('decodeJson ignores inherited wire keys', () => {
    const s = struct.object({
      name: struct.string().tag(tag.json('user_name')),
    })
    const wire = Object.create({ user_name: 'admin' })

    expect(decodeJson(s, wire)).toEqual({ name: '' })
  })
})
