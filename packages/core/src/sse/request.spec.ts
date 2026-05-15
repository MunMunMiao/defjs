import { describe, expect, test } from 'vitest'
import { createEventStreamRequest } from './request'

describe('createEventStreamRequest', () => {
  test('does not override existing Content-Type header with bodyContentType', () => {
    const request = createEventStreamRequest(
      'GET',
      '/events',
      undefined,
      (req) => {
        req.headers({ 'Content-Type': 'application/json' })
        req.json({ key: 'value' })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.headers.get('Content-Type')).toBe('application/json')
  })

  test('sets Content-Type from bodyContentType when header is not already set', () => {
    const request = createEventStreamRequest(
      'POST',
      '/events',
      undefined,
      (req) => {
        req.json({ key: 'value' })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.headers.get('Content-Type')).toBe('application/json')
  })
})
