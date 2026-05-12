import { describe, expect, test } from 'vitest'
import { createWebSocketUrl } from './build'

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
})
