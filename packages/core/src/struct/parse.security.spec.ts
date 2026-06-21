import { describe, expect, test } from 'vitest'
import { decodeJson, encodeJson } from './codec/json'
import { struct } from './index'
import { parseStructTuple as parse } from './introspection'

describe('parse.ts prototype pollution defense', () => {
  test('parseObjectValue strips __proto__ without polluting Object.prototype', () => {
    const s = struct.object({})
    const [err, val] = parse(s, JSON.parse('{"__proto__":{"polluted":true}}'))
    if (err) {
      throw err
    }
    expect((Object.prototype as { [key: string]: unknown })['polluted']).toBeUndefined()
    expect(Object.hasOwn(val as object, '__proto__')).toBe(false)
  })

  test('parseRecordValue does not pollute Object.prototype', () => {
    const s = struct.record(struct.any())
    parse(s, JSON.parse('{"__proto__":{"polluted":true}}'))
    expect((Object.prototype as { [key: string]: unknown })['polluted']).toBeUndefined()
  })

  test('parsed object output has null prototype(Object.create(null))', () => {
    const s = struct.object({ x: struct.string() })
    const [err, val] = parse(s, { x: 'hi' })
    if (err) {
      throw err
    }
    expect(Object.getPrototypeOf(val)).toBeNull()
  })

  test('parsed record output has null prototype', () => {
    const s = struct.record(struct.string())
    const [err, val] = parse(s, { k: 'v' })
    if (err) {
      throw err
    }
    expect(Object.getPrototypeOf(val)).toBeNull()
  })

  test('"__proto__" key preserved as own property under record output', () => {
    const s = struct.record(struct.any())
    const [err, val] = parse(s, JSON.parse('{"__proto__":"data"}'))
    if (err) {
      throw err
    }
    expect(Object.hasOwn(val as object, '__proto__')).toBe(true)
    expect((val as { [key: string]: unknown })['__proto__']).toBe('data')
  })

  test('parseObjectValue ignores inherited declared fields', () => {
    const s = struct.object({ pollutedId: struct.string() })
    Object.defineProperty(Object.prototype, 'pollutedId', {
      configurable: true,
      value: 'admin',
    })

    try {
      const [err, val] = parse(s, {})
      if (err) {
        throw err
      }

      expect(val).toEqual({ pollutedId: '' })
    } finally {
      delete (Object.prototype as { [key: string]: unknown })['pollutedId']
    }
  })

  test('parseObjectValue ignores inherited declared fields in plain input', () => {
    const s = struct.object({ pollutedId: struct.string() })
    Object.defineProperty(Object.prototype, 'pollutedId', {
      configurable: true,
      value: 'admin',
    })

    try {
      const [err, val] = parse(s, {})
      if (err) {
        throw err
      }

      expect(val).toEqual({ pollutedId: '' })
    } finally {
      delete (Object.prototype as { [key: string]: unknown })['pollutedId']
    }
  })

  test('decodeJson ignores inherited wire keys', () => {
    const s = struct.object({
      name: struct.string().alias('user_name'),
    })
    const wire = Object.create({ user_name: 'admin' })

    expect(decodeJson(s, wire)).toEqual({ name: '' })
  })

  test('JSON aliases for dangerous keys do not pollute prototypes', () => {
    const dangerousStruct = struct.object({
      constructorValue: struct.string().alias('constructor'),
      protoValue: struct.string().alias('__proto__'),
    })

    const encoded = encodeJson(dangerousStruct, { constructorValue: 'ctor', protoValue: 'proto' }) as { [key: string]: unknown }
    expect(Object.hasOwn(encoded, '__proto__')).toBe(true)
    expect(Object.hasOwn(encoded, 'constructor')).toBe(true)
    expect(encoded['__proto__']).toBe('proto')
    expect(encoded['constructor']).toBe('ctor')
    expect((Object.prototype as { [key: string]: unknown })['proto']).toBeUndefined()

    const decoded = decodeJson(dangerousStruct, JSON.parse('{"__proto__":"proto","constructor":"ctor"}'))
    expect(decoded).toEqual({ constructorValue: 'ctor', protoValue: 'proto' })
    expect(Object.getPrototypeOf(decoded)).toBeNull()
    expect((Object.prototype as { [key: string]: unknown })['proto']).toBeUndefined()
  })

  test('keeps dangerous wire keys as own data properties during alias decode', () => {
    const Payload = struct.object({
      proto: struct.string().alias('__proto__'),
      constructorValue: struct.string().alias('constructor'),
    })

    const raw: { [key: string]: unknown } = Object.create(null)
    raw['__proto__'] = 'safe'
    raw['constructor'] = 'value'

    const output = decodeJson(Payload, raw)

    expect(output).toEqual({ proto: 'safe', constructorValue: 'value' })
    expect(({} as { proto?: string }).proto).toBeUndefined()
  })
})
