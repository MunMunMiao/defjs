import type { Context, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createOpenTelemetryWebSocketInterceptor } from './web_socket'

interface MockSpan {
  name: string
  kind: number
  attributes: Record<string, unknown>
  status?: { code: number }
  ended: boolean
  addEvent: ReturnType<typeof vi.fn>
  setAttribute: ReturnType<typeof vi.fn>
  setStatus: ReturnType<typeof vi.fn>
  recordException: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

let activeSpans: MockSpan[]

function createMockPropagator() {
  return {
    inject: vi.fn((ctx: Context, carrier: { params: URLSearchParams }) => {
      carrier.params.set('traceparent', 'mock-trace-id')
    }),
    extract: vi.fn((ctx: Context) => ctx),
    fields: vi.fn(() => ['traceparent']),
  } as unknown as TextMapPropagator<{ params: URLSearchParams }>
}

function createMockTracer() {
  activeSpans = []

  const startSpan = vi.fn((name: string, options?: { kind?: number; attributes?: Record<string, unknown> }, ctx?: Context) => {
    const span: MockSpan = {
      name,
      kind: options?.kind ?? 0,
      attributes: { ...(options?.attributes ?? {}) },
      status: undefined,
      ended: false,
      addEvent: vi.fn(),
      setAttribute: vi.fn((key: string, value: unknown) => {
        span.attributes[key] = value
      }),
      setStatus: vi.fn((status: { code: number }) => {
        span.status = status
      }),
      recordException: vi.fn(),
      end: vi.fn(() => {
        span.ended = true
      }),
    }
    activeSpans.push(span)
    return span
  })

  return {
    startSpan,
    startActiveSpan: vi.fn(),
  } as unknown as Tracer
}

function createMockMetrics() {
  return {
    requestCounter: { add: vi.fn() },
    errorCounter: { add: vi.fn() },
    durationHistogram: { record: vi.fn() },
  }
}

function makeRequest(queryParams?: URLSearchParams) {
  return {
    endpoint: '/ws',
    baseEndpoint: 'wss://api.example.com',
    queryParams: queryParams ?? new URLSearchParams(),
    queryString: queryParams?.toString() ?? '',
  }
}

function makeMockSession() {
  return {
    closed: Promise.resolve(),
  }
}

function makeMockSessionError(error: unknown) {
  return {
    closed: Promise.reject(error),
  }
}

describe('createOpenTelemetryWebSocketInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should extract trace context from headers via propagator', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    const req = makeRequest()
    req.headers = new Headers({ traceparent: 'upstream-trace-id' })
    const next = vi.fn(async () => makeMockSession())

    await interceptor.fn(req, next)

    expect(propagator.extract).toHaveBeenCalled()
  })

  test('should inject traceparent into query params', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    const req = makeRequest()
    const next = vi.fn(async () => makeMockSession())

    await interceptor.fn(req, next)

    expect(propagator.inject).toHaveBeenCalled()
    const calls = (next as unknown as { mock: { calls: [any][] } }).mock.calls
    expect(calls[0]?.[0].queryParams?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create span with correct name', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockSession())

    expect(activeSpans).toHaveLength(1)
    expect(activeSpans[0]?.name).toBe('WebSocket connect')
  })

  test('should set url.full attribute', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockSession())

    expect(activeSpans[0]?.attributes['url.full']).toBe('wss://api.example.com/ws')
  })

  test('should add websocket.connected event on success', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockSession())

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.connected')
  })

  test('should end span when session closes normally', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockSession())

    // Wait for the closed promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record error when session.closed rejects', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockSessionError(new Error('connection lost')))

    // Wait for the closed promise to reject
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record error on next() exception', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator })

    await expect(
      interceptor.fn(makeRequest(), async () => {
        throw new Error('connect failed')
      }),
    ).rejects.toThrow('connect failed')

    expect(activeSpans[0]?.ended).toBe(true)
    expect(activeSpans[0]?.status?.code).toBe(2) // ERROR
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
  })

  test('should skip span creation when requireParentSpan and no active span', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator,
      requireParentSpan: true,
    })

    const next = vi.fn(async () => makeMockSession())
    await interceptor.fn(makeRequest(), next)

    expect(activeSpans).toHaveLength(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('should not inject query params when queryPropagation is false', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator,
      queryPropagation: false,
    })

    const req = makeRequest()
    const next = vi.fn(async () => makeMockSession())

    await interceptor.fn(req, next)

    expect(propagator.inject).not.toHaveBeenCalled()
    const calls = (next as unknown as { mock: { calls: [any][] } }).mock.calls
    expect(calls[0]?.[0].queryParams?.get('traceparent')).toBeNull()
  })

  test('should record metrics on success', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator,
      metrics,
    })

    await interceptor.fn(makeRequest(), async () => makeMockSession())

    expect(metrics.requestCounter.add).toHaveBeenCalledWith(1, {})
    expect(metrics.durationHistogram.record).toHaveBeenCalled()
  })

  test('should record error metrics on exception', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator,
      metrics,
    })

    await expect(
      interceptor.fn(makeRequest(), async () => {
        throw new Error('fail')
      }),
    ).rejects.toThrow('fail')

    expect(metrics.errorCounter.add).toHaveBeenCalledWith(1, {})
    expect(metrics.durationHistogram.record).toHaveBeenCalled()
  })
})
