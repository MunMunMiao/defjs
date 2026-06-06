import { describe, expect, test } from 'vitest'
import { struct, tag } from '../index'
import { encodeHeaders, encodePathParams, encodeQueryParams } from './query'

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

  test('falls back to field keys for path query and header records', () => {
    const query = struct.object({
      includeProfile: struct.boolean().tag(tag.json('include_profile')),
    })
    const headers = struct.object({
      traceId: struct.string().tag(tag.json('trace_id')),
    })
    const path = struct.object({
      userId: struct.number().tag(tag.json('user_id')),
    })

    expect(encodeQueryParams(query, { includeProfile: true })).toEqual({ includeProfile: true })
    expect(encodeHeaders(headers, { traceId: 'trace-1' })).toEqual({ traceId: 'trace-1' })
    expect(encodePathParams(path, { userId: 1 })).toEqual({ userId: 1 })
  })
})
