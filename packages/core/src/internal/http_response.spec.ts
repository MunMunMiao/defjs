import { describe, expect, test } from 'vitest'
import { makeResponse } from './http_response'

describe('Response', () => {
  test('should make response', () => {
    const res = makeResponse({
      status: 200,
      statusText: 'OK',
      body: 'Hello World!',
    })
    expect(res.status).toBe(200)
    expect(res.statusText).toBe('OK')
    expect(res.body).toBe('Hello World!')
    expect(res.ok).toBe(true)
  })

  test('should make error response', () => {
    const res = makeResponse({
      status: 500,
      statusText: 'Server Error',
      body: 'Server Error',
    })
    expect(res.status).toBe(500)
    expect(res.statusText).toBe('Server Error')
    expect(res.body).toBe('Server Error')
    expect(res.error).toBeUndefined()
    expect(res.ok).toBe(false)
  })

  test('should make network error response', () => {
    const res = makeResponse()
    expect(res.status).toBe(0)
    expect(res.statusText).toBe('')
    expect(res.error).toBeInstanceOf(Error)
    expect((res.error as Error).message).toContain('(unknown url)')
    expect((res.error as Error).message).toContain(': 0')
  })

  test('should not treat non-2xx status as a transport or representation error', () => {
    const res = makeResponse({
      status: 404,
      statusText: 'Not Found',
      url: '/api/users',
    })

    expect(res.error).toBeUndefined()
    expect(res.ok).toBe(false)
  })

  test('should preserve custom error when provided', () => {
    const customError = new Error('validation failed')
    const res = makeResponse({
      error: customError,
      status: 500,
    })

    expect(res.error).toBe(customError)
    expect((res.error as Error).message).toBe('validation failed')
  })
})
