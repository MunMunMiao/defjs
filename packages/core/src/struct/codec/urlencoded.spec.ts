import { describe, expect, test } from 'vitest'
import { struct } from '../index'
import { encodeUrlencoded } from './urlencoded'

describe('codec/urlencoded.ts', () => {
  test('encodes application/x-www-form-urlencoded body as URLSearchParams', () => {
    const form = struct.object({
      plainName: struct.string(),
      name: struct.string().alias('user_name'),
      tags: struct.array(struct.string()).alias('tag'),
    })

    const params = encodeUrlencoded(form, {
      plainName: 'field-key',
      name: 'Miao',
      tags: ['a', 'b'],
    })

    expect(params).toBeInstanceOf(URLSearchParams)
    expect(params.toString()).toBe('plainName=field-key&user_name=Miao&tag=a&tag=b')
  })

  test('skips missing optional date and bigint fields before primitive encode', () => {
    const body = struct.object({
      createdAt: struct.date().optional().alias('created_at'),
      count: struct.bigint().optional(),
      name: struct.string(),
    })

    const params = encodeUrlencoded(body, { createdAt: undefined, name: 'miao' })

    expect(params.toString()).toBe('name=miao')
  })

  test('keeps urlencoded array handling non-recursive for nested arrays', () => {
    const Body = struct.object({ value: struct.unknown() })

    expect(() => encodeUrlencoded(Body, { value: [['x']] })).toThrow('urlencoded value for "value" requires an explicit serializer')
  })
})
