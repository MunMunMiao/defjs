import { describe, expect, test } from 'vitest'
import { encodeQueryParams, struct, tag } from '../index'

describe('codec/query.ts', () => {
  test('keeps scalar query params and requires serializer support for complex objects', () => {
    const input = struct.object({
      include: struct.boolean().tag(tag.query('include')),
      meta: struct.object({ page: struct.number() }).tag(tag.query('meta')),
    })

    expect(encodeQueryParams(input, { include: true, meta: undefined })).toEqual({
      include: true,
    })
    expect(() => encodeQueryParams(input, { include: true, meta: { page: 1 } })).toThrow(
      'query value for "meta" requires queryParamsSerializer or a scalar value',
    )
  })
})
