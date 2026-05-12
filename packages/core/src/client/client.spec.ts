import { beforeEach, describe, expect, test } from 'vitest'
import { ERR_NOT_FOUND_GLOBAL_CLIENT } from '../error'
import { fetchHandler } from '../http/transport'
import { cloneClient, createClient } from './client'
import { DEFAULT_HTTP_OPTIONS, DEFAULT_QUERY_PARAMS_SERIALIZER, DEFAULT_SSE_OPTIONS, DEFAULT_WEB_SOCKET_OPTIONS } from './config'
import { getGlobalClient, restGlobalClient, setGlobalClient } from './global'
import type { Client } from './resolve'
import { getClientConfig, isClient } from './resolve'

describe('Client', () => {
  let baseClient: Client

  beforeEach(() => {
    restGlobalClient()
    baseClient = createClient({
      endpoint: 'https://example.com/v1',
    })
  })

  test('should create client with normalized endpoint and default protocol options', () => {
    const config = getClientConfig(baseClient)

    expect(config.endpoint).toBe('https://example.com/v1')
    expect(config.http).toEqual(DEFAULT_HTTP_OPTIONS)
    expect(config.sse).toEqual(DEFAULT_SSE_OPTIONS)
    expect(config.webSocket).toEqual(DEFAULT_WEB_SOCKET_OPTIONS)
    expect(config.queryParamsSerializer).toBe(DEFAULT_QUERY_PARAMS_SERIALIZER)
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
    expect(config.http.handler).toBe(fetchHandler)
  })

  test('should getClientConfig throw for non-client', () => {
    expect(() => getClientConfig({} as never)).toThrowError()
  })

  test('should setGlobalClient set global client', () => {
    setGlobalClient(
      createClient({
        endpoint: 'https://example.com/v1',
      }),
    )

    const client = getGlobalClient()
    expect(isClient(client)).toBe(true)

    restGlobalClient()
    expect(() => getGlobalClient()).toThrowError(ERR_NOT_FOUND_GLOBAL_CLIENT)
  })

  test('should setGlobalClient set global client', () => {
    setGlobalClient(baseClient)
    expect(getGlobalClient()).toBe(baseClient)
  })

  test('should cloneClient override endpoint and protocol defaults', () => {
    const nextClient = cloneClient(baseClient, {
      endpoint: 'https://api.example.com/root',
      http: {
        handler: async request => fetchHandler(request),
      },
      sse: {
        fetch: DEFAULT_SSE_OPTIONS.fetch,
      },
      webSocket: {
        heartbeat: {
          intervalMs: 1_000,
        },
        protocols: ['json'],
      },
    })

    expect(getClientConfig(nextClient)).toMatchObject({
      endpoint: 'https://api.example.com/root',
      webSocket: {
        heartbeat: {
          intervalMs: 1_000,
        },
        protocols: ['json'],
      },
    })
  })
})
