import { describe, expect, test } from 'vitest'
import { schema } from './index'

describe('schema prototype pollution defense', () => {
  test('parseObjectValue passthrough does not pollute Object.prototype', () => {
    const s = schema.object({}).passthrough()
    s.parse(JSON.parse('{"__proto__":{"polluted":true}}'))
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('parseRecordValue does not pollute Object.prototype', () => {
    const s = schema.record(schema.any())
    s.parse(JSON.parse('{"__proto__":{"polluted":true}}'))
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('parsed object output has null prototype(Object.create(null))', () => {
    const s = schema.object({ x: schema.string() })
    const [, val] = s.parse({ x: 'hi' })
    expect(Object.getPrototypeOf(val)).toBeNull()
  })

  test('parsed record output has null prototype', () => {
    const s = schema.record(schema.string())
    const [, val] = s.parse({ k: 'v' })
    expect(Object.getPrototypeOf(val)).toBeNull()
  })

  test('"__proto__" key preserved as own property under passthrough', () => {
    const s = schema.object({}).passthrough()
    const [, val] = s.parse(JSON.parse('{"__proto__":"data"}'))
    expect(Object.hasOwn(val as object, '__proto__')).toBe(true)
    expect((val as Record<string, unknown>)['__proto__']).toBe('data')
  })
})
