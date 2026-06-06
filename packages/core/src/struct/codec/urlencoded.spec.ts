import { describe, expect, test } from 'vitest'
import { struct, tag } from '../index'
import { encodeUrlencoded } from './urlencoded'

describe('codec/urlencoded.ts', () => {
  test('encodes application/x-www-form-urlencoded body as URLSearchParams', () => {
    const form = struct.object({
      fallbackName: struct.string(),
      name: struct.string().tag(tag.urlencoded('user_name')),
      tags: struct.array(struct.string()).tag(tag.urlencoded('tag')),
    })

    const params = encodeUrlencoded(form, {
      fallbackName: 'field-key',
      name: 'Miao',
      tags: ['a', 'b'],
    })

    expect(params).toBeInstanceOf(URLSearchParams)
    expect(params.toString()).toBe('fallbackName=field-key&user_name=Miao&tag=a&tag=b')
  })
})
