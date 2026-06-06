import type { ClientConfig } from '@defjs/core'
import { describe, expect, test } from 'vitest'
import { withOpenTelemetry } from './option'

function makeConfig(): ClientConfig {
  return {
    endpoint: 'https://api.example.com',
    interceptors: [],
    queryParamsSerializer: params => params.toString(),
    sse: { fetch: globalThis.fetch.bind(globalThis) },
    webSocket: {},
  }
}

describe('withOpenTelemetry', () => {
  test('should create interceptors for all transports by default', () => {
    const config = makeConfig()
    const option = withOpenTelemetry({ serviceName: 'test-app' })
    option(config)

    expect(config.interceptors).toHaveLength(3)
  })

  test('should disable HTTP interceptor when http is false', () => {
    const config = makeConfig()
    const option = withOpenTelemetry({ serviceName: 'test-app', http: false })
    option(config)

    expect(config.interceptors).toHaveLength(2)
  })

  test('should disable SSE interceptor when sse is false', () => {
    const config = makeConfig()
    const option = withOpenTelemetry({ serviceName: 'test-app', sse: false })
    option(config)

    expect(config.interceptors).toHaveLength(2)
  })

  test('should disable WebSocket interceptor when webSocket is false', () => {
    const config = makeConfig()
    const option = withOpenTelemetry({ serviceName: 'test-app', webSocket: false })
    option(config)

    expect(config.interceptors).toHaveLength(2)
  })

  test('should use default service name when not provided', () => {
    const config = makeConfig()
    const option = withOpenTelemetry()
    option(config)

    expect(config.interceptors).toHaveLength(3)
  })

  test('should return ClientOption function', () => {
    const option = withOpenTelemetry({ serviceName: 'test' })
    expect(typeof option).toBe('function')
  })
})
