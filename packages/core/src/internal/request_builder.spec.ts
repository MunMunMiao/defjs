import { describe, expect, test } from 'vitest'
import { buildRequest } from './request_builder'

describe('request_builder formUrlEncoded', () => {
  test('formUrlEncoded uses a single URLSearchParams instance(no double allocation)', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ a: '1', b: '2' })
    })

    expect(built.body).toBeInstanceOf(URLSearchParams)
    const body = built.body as URLSearchParams
    expect(body.get('a')).toBe('1')
    expect(body.get('b')).toBe('2')
    expect(built.bodyContentType).toContain('application/x-www-form-urlencoded')
  })

  test('formUrlEncoded honors custom contentType while keeping single instance', () => {
    const built = buildRequest(null, request => {
      request.formUrlEncoded({ x: 'y' }, { contentType: 'application/x-www-form-urlencoded; charset=ascii' })
    })

    expect((built.body as URLSearchParams).get('x')).toBe('y')
    expect(built.bodyContentType).toBe('application/x-www-form-urlencoded; charset=ascii')
  })
})
