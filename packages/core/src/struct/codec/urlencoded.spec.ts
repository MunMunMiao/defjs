import { describe, expect, test } from 'vitest'
import { encodeUrlencoded, struct, tag } from '../index'

describe('codec/urlencoded.ts', () => {
  test('encodes application/x-www-form-urlencoded body as URLSearchParams', () => {
    const form = struct.object({
      internalOnly: struct.string(),
      name: struct.string().tag(tag.urlencoded('user_name')),
      tags: struct.array(struct.string()).tag(tag.urlencoded('tag')),
    })

    const params = encodeUrlencoded(form, {
      internalOnly: 'hidden',
      name: 'Miao',
      tags: ['a', 'b'],
    })

    expect(params).toBeInstanceOf(URLSearchParams)
    expect(params.toString()).toBe('user_name=Miao&tag=a&tag=b')
  })
})
