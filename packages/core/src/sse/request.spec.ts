import { describe, expect, test } from 'vitest'
import { struct, tag } from '../struct'
import { createEventStreamRequest } from './request'

describe('createEventStreamRequest', () => {
  test('builds request-shaped path query and headers', () => {
    const input = struct.request({
      headers: struct.object({
        token: struct.string().tag(tag.header('x-token')),
      }),
      path: struct.object({
        id: struct.number(),
      }),
      query: struct.object({
        include: struct.boolean(),
      }),
    })

    const request = createEventStreamRequest(
      'GET',
      '/users/:id/events',
      { headers: { token: 'secret' }, path: { id: 1 }, query: { include: true } },
      undefined,
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        input,
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(request.endpoint).toBe('/users/1/events')
    expect(request.queryString).toBe('include=true')
    expect(request.headers?.get('x-token')).toBe('secret')
  })

  test('rejects body helpers in explicit build', () => {
    const input = struct.request({
      body: struct.json(struct.object({ key: struct.string() })),
    })
    expect(() =>
      createEventStreamRequest(
        'GET',
        '/events',
        { body: { key: 'value' } },
        (req: any, view: any) => {
          req.setJson({ key: view.body.key })
        },
        {
          abort: new AbortController().signal,
          baseEndpoint: 'https://api.example.com',
          input,
          queryParamsSerializer: params => params.toString(),
        },
      ),
    ).toThrow('SSE build() does not support request body')
  })

  test('rejects body section in request-shaped input', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          id: struct.string(),
        }),
      ),
    })

    expect(() =>
      createEventStreamRequest('GET', '/events', { body: { id: '1' } }, undefined, {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        input,
        queryParamsSerializer: params => params.toString(),
      }),
    ).toThrow('SSE request input does not support body section')
  })

  test('allows explicit headers', () => {
    const input = struct.request({
      headers: struct.object({
        accept: struct.string(),
      }),
    })
    const request = createEventStreamRequest(
      'GET',
      '/events',
      { headers: { accept: 'text/event-stream' } },
      (req: any, view: any) => {
        req.setHeaders({ accept: view.headers.accept })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        input,
        queryParamsSerializer: params => params.toString(),
      },
    )

    expect(request.headers?.get('accept')).toBe('text/event-stream')
  })
})
