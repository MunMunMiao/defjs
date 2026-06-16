import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createHttpInterceptor } from '../interceptor'
import { createClient } from './client'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import {
  withCredentials,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
  withQueryParamsSerializer,
  withSSEHandle,
  withSSEOnInvalidEvent,
  withSSEOptions,
  withSSEQueue,
  withSSEReconnect,
  withWebSocketBeforeConnect,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketOptions,
  withWebSocketProtocols,
  withWebSocketQueue,
  withWebSocketReconnect,
  withXSRF,
} from './index'
import type { Client } from './resolve'
import { getClientConfig, isClient } from './resolve'

describe('Client', () => {
  let baseClient: Client

  beforeEach(() => {
    baseClient = createClient(withEndpoint('https://example.com/v1'))
  })

  test('should create client with normalized endpoint and default transport options', () => {
    const config = getClientConfig(baseClient)

    expect(config.endpoint).toBe('https://example.com/v1')
    expect(config.http).toEqual(DEFAULT_HTTP_OPTIONS)
    expect(config.sse).toEqual(DEFAULT_SSE_OPTIONS)
    expect(config.webSocket).toMatchObject({ WebSocket: globalThis.WebSocket })
    expect(config.queryParamsSerializer).toBe(DEFAULT_QUERY_PARAMS_SERIALIZER)
    expect(config.http.fetch).toBe(config.sse.fetch)
    expect(DEFAULT_QUERY_PARAMS_SERIALIZER(new URLSearchParams({ a: '1' }))).toBe('a=1')
  })

  test('should isClient return true for client', () => {
    expect(isClient(baseClient)).toBe(true)
  })

  test('should isClient return false for non-client', () => {
    expect(isClient({})).toBe(false)
  })

  test('should getClientConfig return client config', () => {
    const config = getClientConfig(baseClient)

    expect(config.endpoint).toBe('https://example.com/v1')
    expect(config.interceptors).toEqual([])
  })

  test('should getClientConfig throw for non-client', () => {
    expect(() => getClientConfig({} as never)).toThrowError()
  })

  test('DEFAULT_HTTP_OPTIONS.fetch and DEFAULT_SSE_OPTIONS.fetch are bound to globalThis(detachable without losing this)', async () => {
    const { fetch: httpDetached } = DEFAULT_HTTP_OPTIONS
    const { fetch: sseDetached } = DEFAULT_SSE_OPTIONS

    await expect(httpDetached('about:blank').catch(() => 'caught')).resolves.toBeDefined()
    await expect(sseDetached('about:blank').catch(() => 'caught')).resolves.toBeDefined()
  })

  test('should apply all client option helpers', () => {
    const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
    const interceptor = createHttpInterceptor(async (_request) => new Response('ok', { status: 200 }))
    const serializer = (params: URLSearchParams) => `serialized=${params.toString()}`
    const beforeConnect = vi.fn()
    const tokenProvider = vi.fn(() => 'xsrf-token')

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
    }

    const client = createClient(
      withEndpoint('https://api.example.com'),
      withCredentials(true),
      withHTTPHandle(customFetch),
      withSSEHandle(customFetch),
      withInterceptors(interceptor),
      withQueryParamsSerializer(serializer),
      withXSRF({
        cookieName: 'CUSTOM-XSRF-TOKEN',
        headerName: 'X-CUSTOM-XSRF-TOKEN',
        tokenProvider,
      }),
      withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
      withWebSocketBeforeConnect(beforeConnect),
      withWebSocketProtocols(['json']),
      withWebSocketHeartbeat({
        intervalMs: 1_000,
        timeoutMs: 5_000,
      }),
      withWebSocketQueue({
        maxSize: 128,
        overflow: 'drop-oldest',
      }),
      withWebSocketReconnect({
        attempts: 3,
        delayMs: 1_000,
      }),
    )

    const config = getClientConfig(client)

    expect(config.endpoint).toBe('https://api.example.com')
    expect(config.withCredentials).toBe(true)
    expect(config.http.fetch).toBe(customFetch)
    expect(config.sse.fetch).toBe(customFetch)
    expect(config.interceptors).toEqual([interceptor])
    expect(config.queryParamsSerializer).toBe(serializer)
    expect(config.xsrf).toEqual({
      cookieName: 'CUSTOM-XSRF-TOKEN',
      headerName: 'X-CUSTOM-XSRF-TOKEN',
      tokenProvider,
    })
    expect(config.webSocket.WebSocket).toBe(MockWebSocket)
    expect(config.webSocket.beforeConnect).toBe(beforeConnect)
    expect(config.webSocket.protocols).toEqual(['json'])
    expect(config.webSocket.heartbeat).toEqual({
      intervalMs: 1_000,
      timeoutMs: 5_000,
    })
    expect(config.webSocket.queue).toEqual({
      maxSize: 128,
      overflow: 'drop-oldest',
    })
    expect(config.webSocket.reconnect).toEqual({
      attempts: 3,
      delayMs: 1_000,
    })
  })

  test('should support withXSRF default options', () => {
    const client = createClient(withEndpoint('https://example.com'), withXSRF())

    expect(getClientConfig(client).xsrf).toEqual({
      cookieName: 'XSRF-TOKEN',
      headerName: 'X-XSRF-TOKEN',
      tokenProvider: undefined,
    })
  })

  test('should support withSSEOptions helper', () => {
    const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
    const onInvalidEvent = vi.fn()

    const client = createClient(
      withEndpoint('https://example.com'),
      withSSEOptions({
        fetch: customFetch,
        onInvalidEvent,
        reconnect: { attempts: 3, delayMs: 2000 },
        queue: { maxSize: 64, overflow: 'drop-oldest' },
        maxBufferSize: 8192,
      }),
    )

    const config = getClientConfig(client).sse
    expect(config.fetch).toBe(customFetch)
    expect(config.onInvalidEvent).toBe(onInvalidEvent)
    expect(config.reconnect).toEqual({ attempts: 3, delayMs: 2000 })
    expect(config.queue).toEqual({ maxSize: 64, overflow: 'drop-oldest' })
    expect(config.maxBufferSize).toBe(8192)
  })

  test('should support individual SSE option helpers', () => {
    const onInvalidEvent = vi.fn()

    const client = createClient(
      withEndpoint('https://example.com'),
      withSSEOnInvalidEvent(onInvalidEvent),
      withSSEReconnect({ attempts: 5, delayMs: 500 }),
      withSSEQueue({ maxSize: 32, overflow: 'error' }),
    )

    const config = getClientConfig(client).sse
    expect(config.onInvalidEvent).toBe(onInvalidEvent)
    expect(config.reconnect).toEqual({ attempts: 5, delayMs: 500 })
    expect(config.queue).toEqual({ maxSize: 32, overflow: 'error' })
  })

  test('withSSEOptions ignores undefined fields', () => {
    const before = getClientConfig(baseClient).sse

    const client = createClient(withEndpoint('https://example.com'), withSSEOptions({}))

    const config = getClientConfig(client).sse
    expect(config.fetch).toBe(before.fetch)
    expect(config.onInvalidEvent).toBeUndefined()
    expect(config.reconnect).toBeUndefined()
    expect(config.queue).toBeUndefined()
    expect(config.maxBufferSize).toBeUndefined()
  })

  test('should support legacy withWebSocketOptions helper', () => {
    const beforeConnect = vi.fn()

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
    }

    const client = createClient(
      withEndpoint('https://example.com'),
      withWebSocketOptions({
        WebSocket: MockWebSocket as unknown as typeof WebSocket,
        beforeConnect,
        heartbeat: { intervalMs: 100 },
        protocols: ['json'],
        queue: { maxSize: 8 },
        reconnect: { attempts: 2 },
      }),
    )

    const config = getClientConfig(client).webSocket

    expect(config.WebSocket).toBe(MockWebSocket)
    expect(config.beforeConnect).toBe(beforeConnect)
    expect(config.heartbeat).toEqual({ intervalMs: 100 })
    expect(config.protocols).toEqual(['json'])
    expect(config.queue).toEqual({ maxSize: 8 })
    expect(config.reconnect).toEqual({ attempts: 2 })
  })

  test('legacy withWebSocketOptions ignores undefined fields', () => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
    }

    const base = createClient(
      withEndpoint('https://example.com'),
      withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
      withWebSocketProtocols(['json']),
    )

    const next = createClient(withEndpoint('https://example.com'), withWebSocketOptions({}))

    expect(getClientConfig(base).webSocket.WebSocket).toBe(MockWebSocket)
    expect(getClientConfig(next).webSocket.WebSocket).toBe(globalThis.WebSocket)
  })
})
