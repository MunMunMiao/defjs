import { describe, expect, test } from 'vitest'
import type { QueryParamsSerializer } from '../client/config'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { RequestBuildValue } from '../internal/request_values'
import type { AnyStruct } from '../struct'
import { struct } from '../struct'
import { createWebSocketBuild, createWebSocketRequest, createWebSocketUrlFromRequest } from './build'

function unsupportedWebSocketBuild<TInput extends AnyStruct>(build: RequestBuildHandler<TInput>): RequestBuildHandler<TInput, 'webSocket'> {
  // Type boundary: this spec intentionally builds unsupported WebSocket output so the runtime guard rejects it.
  return build as unknown as RequestBuildHandler<TInput, 'webSocket'>
}

function createWebSocketUrl(
  baseEndpoint: string,
  path: string,
  params: { [key: string]: RequestBuildValue } | undefined,
  query: { [key: string]: RequestBuildValue } | undefined,
  queryParamsSerializer: QueryParamsSerializer,
): string {
  const request = createWebSocketRequest({
    abort: new AbortController().signal,
    baseEndpoint,
    build: { params, query },
    path,
    queryParamsSerializer,
  })

  return createWebSocketUrlFromRequest(request)
}

describe('web socket build helpers', () => {
  test('should create websocket urls and convert http protocols', () => {
    expect(
      createWebSocketUrl(
        'https://api.example.com/v1',
        '/chat/:roomId',
        {
          roomId: 9,
        },
        {
          token: 'abc',
        },
        (params) => params.toString(),
      ),
    ).toBe('wss://api.example.com/v1/chat/9?token=abc')

    expect(createWebSocketUrl('http://api.example.com/v1', '/chat', undefined, undefined, (params) => params.toString())).toBe(
      'ws://api.example.com/v1/chat',
    )
  })

  test('should convert http to ws and https to wss', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, undefined, (p) => p.toString())).toBe('ws://localhost/ws')
    expect(createWebSocketUrl('https://localhost', '/ws', undefined, undefined, (p) => p.toString())).toBe('wss://localhost/ws')
    expect(createWebSocketUrl('wss://localhost', '/ws', undefined, undefined, (p) => p.toString())).toBe('wss://localhost/ws')
  })

  test('should fill url params with undefined fallback', () => {
    expect(() => createWebSocketUrl('http://localhost', '/ws/:id', { id: undefined }, undefined, (p) => p.toString())).toThrow(
      'Missing path param: id',
    )
  })

  test('should fill url params with array first element', () => {
    expect(createWebSocketUrl('http://localhost', '/ws/:id', { id: ['a', 'b'] }, undefined, (p) => p.toString())).toBe(
      'ws://localhost/ws/a',
    )
  })

  test('should fill url params with empty array', () => {
    expect(() => createWebSocketUrl('http://localhost', '/ws/:id', { id: [] }, undefined, (p) => p.toString())).toThrow(
      'Missing path param: id',
    )
  })

  test('should serialize query params with undefined value', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { a: undefined }, (p) => p.toString())).toBe('ws://localhost/ws')
  })

  test('should serialize query params with undefined array item', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { tags: ['a', undefined] }, (p) => p.toString())).toBe(
      'ws://localhost/ws?tags=a&tags=undefined',
    )
  })

  test('should serialize query params with array values', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { tags: ['a', 'b'] }, (p) => p.toString())).toBe(
      'ws://localhost/ws?tags=a&tags=b',
    )
  })

  test('should serialize query params with object value', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { data: { key: 'val' } }, (p) => p.toString())).toBe(
      'ws://localhost/ws?data=%7B%22key%22%3A%22val%22%7D',
    )
  })

  test('should serialize query params with null value', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { data: null }, (p) => p.toString())).toBe(
      'ws://localhost/ws?data=null',
    )
  })

  test('createWebSocketBuild should return built request', () => {
    const input = struct.request({
      path: struct.object({
        id: struct.number(),
      }),
      query: struct.object({
        search: struct.string(),
      }),
    })
    const built = createWebSocketBuild({ path: { id: 1 }, query: { search: 'test' } }, undefined, input)
    expect(built.params).toEqual({ id: 1 })
    expect(built.query).toEqual({ search: 'test' })
  })

  test('createWebSocketBuild should throw for unsupported build options', () => {
    const bodyInput = struct.request({
      body: struct.json(struct.object({ body: struct.boolean() })),
    })
    expect(() =>
      createWebSocketBuild(
        { body: { body: true } },
        unsupportedWebSocketBuild<typeof bodyInput>((request, view) => {
          request.setJson({ body: view.body.body })
        }),
        bodyInput,
      ),
    ).toThrow('WebSocket build() only supports path params and query params')

    const headerInput = struct.request({
      headers: struct.object({ 'x-auth': struct.string() }),
    })
    expect(() =>
      createWebSocketBuild(
        { headers: { 'x-auth': 'token' } },
        unsupportedWebSocketBuild<typeof headerInput>((request, view) => {
          request.setHeaders({ 'x-auth': view.headers['x-auth'] })
        }),
        headerInput,
      ),
    ).toThrow('WebSocket build() only supports path params and query params')
  })

  test('createWebSocketBuild rejects headers and body request sections', () => {
    const withHeaders = struct.request({
      headers: struct.object({
        token: struct.string(),
      }),
    })
    expect(() => createWebSocketBuild({ headers: { token: 'secret' } }, undefined, withHeaders)).toThrow(
      'WebSocket request input does not support headers section',
    )

    const withBody = struct.request({
      body: struct.json(
        struct.object({
          id: struct.string(),
        }),
      ),
    })
    expect(() => createWebSocketBuild({ body: { id: '1' } }, undefined, withBody)).toThrow(
      'WebSocket request input does not support body section',
    )
  })

  test('createWebSocketUrl serializes bigint query param', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { id: 1n as never }, (p) => p.toString())).toBe(
      'ws://localhost/ws?id=1',
    )
  })

  test('createWebSocketUrl serializes number and boolean query params', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { active: true, port: 42 }, (p) => p.toString())).toBe(
      'ws://localhost/ws?active=true&port=42',
    )
  })

  test('createWebSocketUrlFromRequest converts https to wss', () => {
    const request = createWebSocketRequest({
      abort: new AbortController().signal,
      baseEndpoint: 'https://api.example.com/v1',
      build: { params: { roomId: '9' }, query: { token: 'abc' } },
      path: '/chat/:roomId',
      queryParamsSerializer: (params) => params.toString(),
      withCredentials: false,
    })
    expect(createWebSocketUrlFromRequest(request)).toBe('wss://api.example.com/v1/chat/9?token=abc')
  })

  test('createWebSocketUrlFromRequest converts http to ws', () => {
    const request = createWebSocketRequest({
      abort: new AbortController().signal,
      baseEndpoint: 'http://api.example.com/v1',
      build: { params: {}, query: {} },
      path: '/chat',
      queryParamsSerializer: (params) => params.toString(),
      withCredentials: false,
    })
    expect(createWebSocketUrlFromRequest(request)).toBe('ws://api.example.com/v1/chat')
  })

  test('createWebSocketUrlFromRequest keeps non-http protocols unchanged', () => {
    const request = createWebSocketRequest({
      abort: new AbortController().signal,
      baseEndpoint: 'wss://api.example.com/v1',
      build: { params: {}, query: {} },
      path: '/chat',
      queryParamsSerializer: (params) => params.toString(),
      withCredentials: false,
    })
    expect(createWebSocketUrlFromRequest(request)).toBe('wss://api.example.com/v1/chat')
  })
})
