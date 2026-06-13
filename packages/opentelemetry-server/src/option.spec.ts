import type { ClientConfig } from '@defjs/core'
import type { Meter, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { describe, expect, test, vi } from 'vitest'
import { withOpenTelemetryServer } from './option'

function makeConfig(): ClientConfig {
  return {
    endpoint: 'https://api.example.com',
    interceptors: [],
    queryParamsSerializer: (params) => params.toString(),
    sse: { fetch: globalThis.fetch.bind(globalThis) },
    webSocket: {},
  }
}

function createMockTracer(): Tracer {
  const spans: Array<Record<string, unknown>> = []
  const startSpan = vi.fn((name: string, options?: Record<string, unknown>, _ctx?: unknown) => {
    const span = {
      name,
      kind: (options?.kind as number) ?? 0,
      attributes: { ...((options?.attributes as Record<string, unknown>) ?? {}) },
      ended: false,
      addEvent: vi.fn(),
      setAttribute: vi.fn((k: string, v: unknown) => {
        span.attributes[k] = v
      }),
      setStatus: vi.fn((s: unknown) => {
        span.status = s
      }),
      recordException: vi.fn(),
      end: vi.fn(() => {
        span.ended = true
      }),
    }
    spans.push(span)
    return span
  })
  return {
    startSpan,
    startActiveSpan: vi.fn(),
  } as unknown as Tracer
}

describe('withOpenTelemetryServer', () => {
  test('should create interceptors for all transports by default', () => {
    const config = makeConfig()
    const option = withOpenTelemetryServer({ tracer: createMockTracer() })
    option(config)

    expect(config.interceptors).toHaveLength(3)
  })

  test('should disable HTTP interceptor when http is false', () => {
    const config = makeConfig()
    const option = withOpenTelemetryServer({ tracer: createMockTracer(), http: false })
    option(config)

    expect(config.interceptors).toHaveLength(2)
  })

  test('should disable SSE interceptor when sse is false', () => {
    const config = makeConfig()
    const option = withOpenTelemetryServer({ tracer: createMockTracer(), sse: false })
    option(config)

    expect(config.interceptors).toHaveLength(2)
  })

  test('should disable WebSocket interceptor when webSocket is false', () => {
    const config = makeConfig()
    const option = withOpenTelemetryServer({ tracer: createMockTracer(), webSocket: false })
    option(config)

    expect(config.interceptors).toHaveLength(2)
  })

  test('should accept external meter', () => {
    const meter = {
      createCounter: vi.fn(() => ({ add: vi.fn() })),
      createHistogram: vi.fn(() => ({ record: vi.fn() })),
    } as unknown as Meter

    const option = withOpenTelemetryServer({ tracer: createMockTracer(), meter })
    expect(typeof option).toBe('function')
  })

  test('should accept custom propagator', () => {
    const propagator = {
      inject: vi.fn(),
      extract: vi.fn((ctx: unknown) => ctx),
      fields: vi.fn(() => ['traceparent']),
    } as unknown as TextMapPropagator

    const option = withOpenTelemetryServer({ tracer: createMockTracer(), propagator })
    expect(typeof option).toBe('function')
  })

  test('should accept requestHook and responseHook', () => {
    const tracer = createMockTracer()
    const requestHook = vi.fn()
    const responseHook = vi.fn()
    const option = withOpenTelemetryServer({ tracer, requestHook, responseHook })
    expect(typeof option).toBe('function')
  })
})
