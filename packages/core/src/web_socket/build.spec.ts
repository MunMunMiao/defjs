import { describe, expect, test } from 'vitest'
import { createWebSocketBuild, createWebSocketUrl } from './build'

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
        params => params.toString(),
      ),
    ).toBe('wss://api.example.com/v1/chat/9?token=abc')

    expect(createWebSocketUrl('http://api.example.com/v1', '/chat', undefined, undefined, params => params.toString())).toBe(
      'ws://api.example.com/v1/chat',
    )
  })

  test('should convert http to ws and https to wss', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, undefined, p => p.toString())).toBe('ws://localhost/ws')
    expect(createWebSocketUrl('https://localhost', '/ws', undefined, undefined, p => p.toString())).toBe('wss://localhost/ws')
    expect(createWebSocketUrl('wss://localhost', '/ws', undefined, undefined, p => p.toString())).toBe('wss://localhost/ws')
  })

  test('should fill url params with undefined fallback', () => {
    expect(createWebSocketUrl('http://localhost', '/ws/:id', { id: undefined }, undefined, p => p.toString())).toBe(
      'ws://localhost/ws/undefined',
    )
  })

  test('should fill url params with array first element', () => {
    expect(createWebSocketUrl('http://localhost', '/ws/:id', { id: ['a', 'b'] }, undefined, p => p.toString())).toBe(
      'ws://localhost/ws/a',
    )
  })

  test('should fill url params with empty array', () => {
    expect(createWebSocketUrl('http://localhost', '/ws/:id', { id: [] }, undefined, p => p.toString())).toBe(
      'ws://localhost/ws/undefined',
    )
  })

  test('should serialize query params with undefined value', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { a: undefined }, p => p.toString())).toBe(
      'ws://localhost/ws',
    )
  })

  test('should serialize query params with array values', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { tags: ['a', 'b'] }, p => p.toString())).toBe(
      'ws://localhost/ws?tags=a&tags=b',
    )
  })

  test('should serialize query params with object value', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { data: { key: 'val' } }, p => p.toString())).toBe(
      'ws://localhost/ws?data=%7B%22key%22%3A%22val%22%7D',
    )
  })

  test('should serialize query params with null value', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { data: null }, p => p.toString())).toBe(
      'ws://localhost/ws?data=null',
    )
  })

  test('createWebSocketBuild should return built request', () => {
    const built = createWebSocketBuild({ id: 1 }, (request, input) => {
      request.pathParams({ id: input.id })
      request.queryParams({ search: 'test' })
    })
    expect(built.params).toEqual({ id: 1 })
    expect(built.query).toEqual({ search: 'test' })
  })

  test('createWebSocketBuild should throw for unsupported build options', () => {
    expect(() =>
      createWebSocketBuild({}, (request) => {
        request.json({ body: true })
      }),
    ).toThrow('WebSocket build() only supports pathParams() and queryParams()')

    expect(() =>
      createWebSocketBuild({}, (request) => {
        request.headers({ 'x-auth': 'token' })
      }),
    ).toThrow('WebSocket build() only supports pathParams() and queryParams()')

    expect(() =>
      createWebSocketBuild({}, (request) => {
        request.withCredentials(true)
      }),
    ).toThrow('WebSocket build() only supports pathParams() and queryParams()')
  })

  test('createWebSocketUrl serializes bigint query param', () => {
    expect(createWebSocketUrl('http://localhost', '/ws', undefined, { id: 1n as never }, p => p.toString())).toBe(
      'ws://localhost/ws?id=1',
    )
  })
})
