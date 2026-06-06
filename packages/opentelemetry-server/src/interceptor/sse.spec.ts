import type { Context, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createOpenTelemetrySseInterceptor } from './sse'

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
    inject: vi.fn((ctx: Context, carrier: Headers) => {
      carrier.set('traceparent', 'mock-trace-id')
    }),
    extract: vi.fn((ctx: Context) => ctx),
    fields: vi.fn(() => ['traceparent', 'tracestate']),
  } as unknown as TextMapPropagator<Headers>
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

function makeRequest() {
  return {
    method: 'GET',
    endpoint: '/events',
    baseEndpoint: 'https://api.example.com',
    headers: new Headers(),
  }
}

function makeMockStream(closeCode = 'done', closeCause?: unknown) {
  return {
    closed: Promise.resolve({ code: closeCode, cause: closeCause }),
  }
}

function makeMockStreamError(error: unknown) {
  return {
    closed: Promise.reject(error),
  }
}

describe('createOpenTelemetrySseInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should inject traceparent header via propagator', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    const req = makeRequest()
    const next = vi.fn(async () => makeMockStream())

    await interceptor.fn(req, next)

    expect(propagator.inject).toHaveBeenCalled()
    const calls = (next as unknown as { mock: { calls: [any][] } }).mock.calls
    expect(calls[0]?.[0].headers?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create span with correct name', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockStream())

    expect(activeSpans).toHaveLength(1)
    expect(activeSpans[0]?.name).toBe('SSE connect')
  })

  test('should set url.full attribute', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockStream())

    expect(activeSpans[0]?.attributes['url.full']).toBe('https://api.example.com/events')
  })

  test('should add sse.connected event on success', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockStream())

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('sse.connected')
  })

  test('should end span when stream closes normally', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockStream())

    // Wait for the closed promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record error when stream closes with error code', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockStream('error', new Error('stream broken')))

    // Wait for the closed promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record error when stream.closed rejects', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeMockStreamError(new Error('rejected')))

    // Wait for the closed promise to reject
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record error on next() exception', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetrySseInterceptor({ tracer, propagator })

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
    const interceptor = createOpenTelemetrySseInterceptor({
      tracer,
      propagator,
      requireParentSpan: true,
    })

    const next = vi.fn(async () => makeMockStream())
    await interceptor.fn(makeRequest(), next)

    expect(activeSpans).toHaveLength(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('should record metrics on success', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetrySseInterceptor({
      tracer,
      propagator,
      metrics,
    })

    await interceptor.fn(makeRequest(), async () => makeMockStream())

    expect(metrics.requestCounter.add).toHaveBeenCalledWith(1, { 'http.request.method': 'GET' })
    expect(metrics.durationHistogram.record).toHaveBeenCalled()
  })

  test('should record error metrics on exception', async () => {
    const tracer = createMockTracer()
    const propagator = createMockPropagator()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetrySseInterceptor({
      tracer,
      propagator,
      metrics,
    })

    await expect(
      interceptor.fn(makeRequest(), async () => {
        throw new Error('fail')
      }),
    ).rejects.toThrow('fail')

    expect(metrics.errorCounter.add).toHaveBeenCalledWith(1, { 'http.request.method': 'GET' })
    expect(metrics.durationHistogram.record).toHaveBeenCalled()
  })
})
