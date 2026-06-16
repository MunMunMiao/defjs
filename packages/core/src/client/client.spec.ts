import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createHttpInterceptor } from '../interceptor'
import { cloneClient, createClient } from './client'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS } from './config'
import { getGlobalClient, resetGlobalClient, setGlobalClient } from './global'
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
    resetGlobalClient()
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

  test('should setGlobalClient set global client', () => {
    setGlobalClient(createClient(withEndpoint('https://example.com/v1')))

    const client = getGlobalClient()
    expect(isClient(client)).toBe(true)

    resetGlobalClient()
    expect(() => getGlobalClient()).toThrowError('Global client has not been set')
  })

  test('should setGlobalClient set global client', () => {
    setGlobalClient(baseClient)
    expect(getGlobalClient()).toBe(baseClient)
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

  test('should cloneClient override endpoint and transport seams', () => {
    const customFetch = vi.fn(
      async () =>
        new Response('ok', {
          headers: {
            'content-type': 'text/plain',
          },
          status: 200,
        }),
    ) as unknown as typeof fetch
    const tokenProvider = vi.fn(() => 'cloned-token')

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
    }

    const nextClient = cloneClient(
      baseClient,
      withEndpoint('https://api.example.com/root'),
      withHTTPHandle(customFetch),
      withSSEHandle(customFetch),
      withXSRF({
        headerName: 'X-CLONED-XSRF',
        tokenProvider,
      }),
      withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
      withWebSocketProtocols(['json']),
      withWebSocketHeartbeat({
        intervalMs: 1_000,
        timeoutMs: 5_000,
      }),
      withWebSocketReconnect({
        attempts: 3,
        delayMs: 1_000,
      }),
    )

    expect(getClientConfig(nextClient)).toMatchObject({
      endpoint: 'https://api.example.com/root',
      http: {
        fetch: customFetch,
      },
      sse: {
        fetch: customFetch,
      },
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-CLONED-XSRF',
        tokenProvider,
      },
      webSocket: {
        WebSocket: MockWebSocket,
        heartbeat: {
          intervalMs: 1_000,
          timeoutMs: 5_000,
        },
        protocols: ['json'],
        reconnect: {
          attempts: 3,
          delayMs: 1_000,
        },
      },
    })
  })

  test('should cloneClient preserve previous endpoint when not overridden', () => {
    const nextClient = cloneClient(baseClient)
    expect(getClientConfig(nextClient).endpoint).toBe('https://example.com/v1')
  })

  test('should cloneClient preserve previous webSocket protocols when not overridden', () => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
    }

    const withProtocols = cloneClient(
      baseClient,
      withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
      withWebSocketProtocols(['proto1']),
    )
    const nextClient = cloneClient(
      withProtocols,
      withWebSocketHeartbeat({
        intervalMs: 500,
      }),
    )
    expect(getClientConfig(nextClient).webSocket.protocols).toEqual(['proto1'])
    expect(getClientConfig(nextClient).webSocket.WebSocket).toBe(MockWebSocket)
  })

  test('should cloneClient copy existing webSocket timing options', () => {
    const sourceClient = createClient(
      withEndpoint('https://example.com'),
      withWebSocketHeartbeat({
        intervalMs: 1_000,
        timeoutMs: 5_000,
      }),
      withWebSocketReconnect({
        attempts: 3,
        delayMs: 1_000,
      }),
      withWebSocketQueue({
        maxSize: 8,
        overflow: 'drop-oldest',
      }),
    )

    const nextClient = cloneClient(sourceClient)
    const config = getClientConfig(nextClient).webSocket

    expect(config.heartbeat).toEqual({
      intervalMs: 1_000,
      timeoutMs: 5_000,
    })
    expect(config.reconnect).toEqual({
      attempts: 3,
      delayMs: 1_000,
    })
    expect(config.queue).toEqual({
      maxSize: 8,
      overflow: 'drop-oldest',
    })
  })

  test('should cloneClient override webSocket protocols with spread', () => {
    const withProtocols = cloneClient(baseClient, withWebSocketProtocols(['proto1']))
    const nextClient = cloneClient(withProtocols, withWebSocketProtocols(['proto2']))
    expect(getClientConfig(nextClient).webSocket.protocols).toEqual(['proto2'])
    expect(getClientConfig(nextClient).webSocket.protocols).not.toBe(getClientConfig(withProtocols).webSocket.protocols)

    ;(getClientConfig(nextClient).webSocket.protocols as string[]).push('proto3')
    expect(getClientConfig(withProtocols).webSocket.protocols).toEqual(['proto1'])
  })

  test('should cloneClient copy existing sse timing options', () => {
    const sourceClient = createClient(
      withEndpoint('https://example.com'),
      withSSEReconnect({ attempts: 3, delayMs: 1000 }),
      withSSEQueue({ maxSize: 8, overflow: 'drop-oldest' }),
    )

    const nextClient = cloneClient(sourceClient)
    const config = getClientConfig(nextClient).sse

    expect(config.reconnect).toEqual({ attempts: 3, delayMs: 1000 })
    expect(config.queue).toEqual({ maxSize: 8, overflow: 'drop-oldest' })
  })

  test('should cloneClient override sse reconnect with spread', () => {
    const withReconnect = cloneClient(baseClient, withSSEReconnect({ attempts: 3, delayMs: 1000 }))
    const nextClient = cloneClient(withReconnect, withSSEReconnect({ attempts: 5, delayMs: 2000 }))

    expect(getClientConfig(nextClient).sse.reconnect).toEqual({ attempts: 5, delayMs: 2000 })
    expect(getClientConfig(nextClient).sse.reconnect).not.toBe(getClientConfig(withReconnect).sse.reconnect)

    ;(getClientConfig(nextClient).sse.reconnect as { attempts: number }).attempts = 99
    expect(getClientConfig(withReconnect).sse.reconnect).toEqual({ attempts: 3, delayMs: 1000 })
  })

  test('should cloneClient override sse queue with spread', () => {
    const withQueue = cloneClient(baseClient, withSSEQueue({ maxSize: 10, overflow: 'drop-oldest' }))
    const nextClient = cloneClient(withQueue, withSSEQueue({ maxSize: 20, overflow: 'error' }))

    expect(getClientConfig(nextClient).sse.queue).toEqual({ maxSize: 20, overflow: 'error' })
    expect(getClientConfig(nextClient).sse.queue).not.toBe(getClientConfig(withQueue).sse.queue)

    ;(getClientConfig(nextClient).sse.queue as { maxSize: number }).maxSize = 99
    expect(getClientConfig(withQueue).sse.queue).toEqual({ maxSize: 10, overflow: 'drop-oldest' })
  })

  test('should cloneClient preserve xsrf config when not overridden', () => {
    const tokenProvider = vi.fn(() => 'initial-token')
    const client = createClient(
      withEndpoint('https://example.com'),
      withXSRF({
        cookieName: 'CUSTOM-XSRF-TOKEN',
        headerName: 'X-CUSTOM-XSRF-TOKEN',
        tokenProvider,
      }),
    )

    const nextClient = cloneClient(client, withCredentials(true))
    expect(getClientConfig(nextClient).xsrf).toEqual({
      cookieName: 'CUSTOM-XSRF-TOKEN',
      headerName: 'X-CUSTOM-XSRF-TOKEN',
      tokenProvider,
    })
    expect(getClientConfig(nextClient).withCredentials).toBe(true)
  })

  test('should cloneClient keep xsrf undefined when source client has none', () => {
    const nextClient = cloneClient(baseClient)

    expect(getClientConfig(nextClient).xsrf).toBeUndefined()
  })

  test('should cloneClient keep webSocket queue undefined when source client has none', () => {
    const nextClient = cloneClient(baseClient)

    expect(getClientConfig(nextClient).webSocket.queue).toBeUndefined()
  })

  test('should cloneClient allow xsrf overrides after cloning', () => {
    const initialTokenProvider = vi.fn(() => 'initial-token')
    const overrideTokenProvider = vi.fn(() => 'override-token')
    const client = createClient(
      withEndpoint('https://example.com'),
      withXSRF({
        cookieName: 'INITIAL-XSRF',
        headerName: 'X-INITIAL-XSRF',
        tokenProvider: initialTokenProvider,
      }),
    )

    const nextClient = cloneClient(
      client,
      withXSRF({
        headerName: 'X-OVERRIDE-XSRF',
        tokenProvider: overrideTokenProvider,
      }),
    )

    expect(getClientConfig(nextClient).xsrf).toEqual({
      cookieName: 'XSRF-TOKEN',
      headerName: 'X-OVERRIDE-XSRF',
      tokenProvider: overrideTokenProvider,
    })
    expect(getClientConfig(client).xsrf).toEqual({
      cookieName: 'INITIAL-XSRF',
      headerName: 'X-INITIAL-XSRF',
      tokenProvider: initialTokenProvider,
    })
  })
})
