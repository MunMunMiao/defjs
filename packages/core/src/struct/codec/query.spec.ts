import { describe, expect, test } from 'vitest'
import { struct } from '../index'
import { forEachEncodedWireField } from './flat'
import { encodeHeaders, encodePathParams, encodeQueryParams } from './query'

describe('codec/query.ts', () => {
  test('keeps scalar query params and requires serializer support for complex objects', () => {
    const input = struct.object({
      include: struct.boolean().alias('include'),
      meta: struct.object({ page: struct.number() }).alias('meta'),
    })

    expect(encodeQueryParams(input, { include: true, meta: undefined })).toEqual({
      include: true,
    })
    expect(() => encodeQueryParams(input, { include: true, meta: { page: 1 } })).toThrow(
      'query value for "meta" requires queryParamsSerializer or a scalar value',
    )
  })

  test('uses aliases for path query and header records', () => {
    const query = struct.object({
      includeProfile: struct.boolean().alias('include_profile'),
    })
    const headers = struct.object({
      traceId: struct.string().alias('trace_id'),
    })
    const path = struct.object({
      userId: struct.number().alias('user_id'),
    })

    expect(encodeQueryParams(query, { includeProfile: true })).toEqual({ include_profile: true })
    expect(encodeHeaders(headers, { traceId: 'trace-1' })).toEqual({ trace_id: 'trace-1' })
    expect(encodePathParams(path, { userId: 1 })).toEqual({ user_id: 1 })
  })

  test('skips missing optional date and bigint fields before primitive encode', () => {
    const query = struct.object({
      createdAt: struct.date().optional().alias('created_at'),
      count: struct.bigint().optional(),
      q: struct.string(),
    })

    expect(encodeQueryParams(query, { q: 'zen' })).toEqual({ q: 'zen' })
    expect(encodePathParams(query, { q: 'zen' })).toEqual({ q: 'zen' })
    expect(encodeHeaders(query, { q: 'zen' })).toEqual({ q: 'zen' })
  })

  test('skips explicitly undefined optional fields before primitive encode', () => {
    const query = struct.object({
      createdAt: struct.date().optional().alias('created_at'),
      count: struct.bigint().optional(),
      q: struct.string(),
    })

    expect(encodeQueryParams(query, { createdAt: undefined, count: undefined, q: 'zen' })).toEqual({
      q: 'zen',
    })
  })

  test('exposes flat projection kernel wire fields', () => {
    const query = struct.object({ q: struct.string().alias('search') })
    const fields: Array<{ key: string; value: unknown }> = []

    forEachEncodedWireField(query, { q: 'zen' }, 'query', (field) => fields.push(field))

    expect(fields).toEqual([{ key: 'search', value: 'zen' }])
  })
})
