import { describe, expect, test } from 'vitest'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct } from '../struct'
import { struct } from '../struct'
import { createEventStreamRequest } from './request'

function unsupportedSseBuild<TInput extends AnyStruct>(build: RequestBuildHandler<TInput>): RequestBuildHandler<TInput, 'sse'> {
  // Type boundary: this spec intentionally builds a body so the SSE transport runtime guard rejects it.
  return build as unknown as RequestBuildHandler<TInput, 'sse'>
}

describe('createEventStreamRequest', () => {
  test('builds request-shaped path query and headers with aliases', () => {
    const input = struct.request({
      headers: struct.object({
        token: struct.string().alias('x-token'),
      }),
      path: struct.object({
        userId: struct.number().alias('user_id'),
      }),
      query: struct.object({
        includeProfile: struct.boolean().alias('include_profile'),
      }),
    })

    const request = createEventStreamRequest(
      'GET',
      '/users/:user_id/events',
      { headers: { token: 'secret' }, path: { userId: 1 }, query: { includeProfile: true } },
      undefined,
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.endpoint).toBe('/users/1/events')
    expect(request.queryString).toBe('include_profile=true')
    expect(request.headers?.get('x-token')).toBe('secret')
  })

  test('encodes a raw path value as one segment', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.string(),
      }),
    })

    const request = createEventStreamRequest('GET', '/users/:id/events', { path: { id: 'a/b ?#%猫' } }, undefined, {
      abort: new AbortController().signal,
      baseEndpoint: 'https://example.com',
      input,
      queryParamsSerializer: (params) => params.toString(),
    })

    expect(request.endpoint).toBe('/users/a%2Fb%20%3F%23%25%E7%8C%AB/events')
  })

  test('rejects request-shaped missing path params', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.string().optional(),
      }),
    })

    expect(() =>
      createEventStreamRequest('GET', '/users/:id/events', { path: {} }, undefined, {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      }),
    ).toThrow('Missing path param: id')
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
        unsupportedSseBuild<typeof input>((req, view) => {
          req.setJson({ key: view.body.key })
        }),
        {
          abort: new AbortController().signal,
          baseEndpoint: 'https://api.example.com',
          input,
          queryParamsSerializer: (params) => params.toString(),
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
        queryParamsSerializer: (params) => params.toString(),
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
      (req, view) => {
        req.setHeaders({ accept: view.headers.accept })
      },
      {
        abort: new AbortController().signal,
        baseEndpoint: 'https://example.com',
        input,
        queryParamsSerializer: (params) => params.toString(),
      },
    )

    expect(request.headers?.get('accept')).toBe('text/event-stream')
  })
})
