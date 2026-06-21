import { describe, expect, test } from 'vitest'
import { appendRecordToHeaders, createResolvedRequestUrl, createSearchParams, fillUrl } from './url'

describe('url helpers', () => {
  test('should resolve endpoint urls with normalized client endpoint path', () => {
    expect(createResolvedRequestUrl('https://api.example.com/v1', '/user/info').toString()).toBe('https://api.example.com/v1/user/info')
    expect(createResolvedRequestUrl('https://api.example.com/v1/', 'user/info', 'page=1').toString()).toBe(
      'https://api.example.com/v1/user/info?page=1',
    )
  })

  test('should reject invalid endpoint paths', () => {
    expect(() => createResolvedRequestUrl('/api', '/user/info')).toThrowError('Client endpoint must be a valid URL')
    expect(() => createResolvedRequestUrl('https://api.example.com/v1', 'https://other.example.com/user')).toThrowError(
      'Endpoint path must not be an absolute URL',
    )
    expect(() => createResolvedRequestUrl('https://api.example.com/v1', '/user/info?page=1')).toThrowError(
      'Endpoint path must not include query or hash',
    )
    expect(() => createResolvedRequestUrl('https://api.example.com/v1', '/user/info#fragment')).toThrowError(
      'Endpoint path must not include query or hash',
    )
  })

  test('should fill urls and create search params from request values', () => {
    expect(
      fillUrl('/user/:id/:name', {
        id: [1, 2],
        name: 'miao',
      }),
    ).toBe('/user/1/miao')

    expect(() =>
      fillUrl('/user/:id', {
        id: undefined,
      }),
    ).toThrow('Missing path param: id')

    expect(() =>
      fillUrl('/user/:id', {
        id: [],
      }),
    ).toThrow('Missing path param: id')

    expect(() =>
      fillUrl('/user/:id/:name', {
        id: [1, 2],
        name: undefined,
      }),
    ).toThrow('Missing path param: name')

    expect(() =>
      fillUrl('/user/:id', {
        id: [],
      }),
    ).toThrow('Missing path param: id')

    expect(() =>
      fillUrl('/user/:id', {
        id: { value: 1 },
      }),
    ).toThrow('path value for "id" requires a scalar value')
    expect(() =>
      fillUrl('/user/:id', {
        id: [{ value: 1 }] as never,
      }),
    ).toThrow('path value for "id" requires a scalar value')

    expect(() =>
      createSearchParams({
        filters: { active: true },
      }),
    ).toThrow('query value for "filters" requires queryParamsSerializer or a scalar value')
    expect(() =>
      createSearchParams({
        filters: [{ active: true }] as never,
      }),
    ).toThrow('query value for "filters" requires queryParamsSerializer or a scalar value')

    const params = createSearchParams(
      {
        filters: { active: true },
        include: true,
        page: 1,
        skip: undefined,
        tags: ['a', 'b', { active: true } as never],
      },
      { allowComplex: true },
    )

    expect(params.toString()).toBe('include=true&page=1&tags=a&tags=b')

    const paramsWithNull = createSearchParams({
      empty: null,
    })
    expect(paramsWithNull.toString()).toBe('empty=null')

    const paramsWithUndefinedArray = createSearchParams({
      tags: [undefined as never],
    })
    expect(paramsWithUndefinedArray.toString()).toBe('')
  })

  test('should append record-like values into headers', () => {
    const fromHeaders = new Headers()
    fromHeaders.set('x-trace-id', 'trace-1')

    const copied = new Headers()
    appendRecordToHeaders(copied, fromHeaders)
    expect(copied.get('x-trace-id')).toBe('trace-1')

    const fromTuples = new Headers()
    appendRecordToHeaders(fromTuples, [
      ['set-cookie', 'a=1'],
      ['set-cookie', 'b=2'],
    ])
    expect(fromTuples.get('set-cookie')).toBe('a=1, b=2')

    const fromRecord = new Headers()
    appendRecordToHeaders(fromRecord, {
      'x-number': 1,
      'x-roles': ['admin', 'user'],
      'x-skip': undefined,
    })
    expect(fromRecord.get('x-number')).toBe('1')
    expect(fromRecord.get('x-roles')).toBe('admin, user')
    expect(fromRecord.has('x-skip')).toBe(false)

    expect(() => appendRecordToHeaders(new Headers(), { 'x-object': { nested: true } })).toThrow(
      'header value for "x-object" requires a scalar value',
    )
    expect(() => appendRecordToHeaders(new Headers(), { 'x-object': [{ nested: true }] as never })).toThrow(
      'header value for "x-object" requires a scalar value',
    )
  })
})
