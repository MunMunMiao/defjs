import type { Context, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createOpenTelemetryHttpInterceptor } from './http'

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

  const startSpan = vi.fn((name: string, options?: { kind?: number; attributes?: Record<string, unknown> }) => {
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

  const startActiveSpan = vi.fn(<T>(name: string, fn: (span: MockSpan) => T) => {
    const span = startSpan(name)
    return fn(span)
  })

  const tracer = {
    startSpan,
    startActiveSpan,
  } as unknown as Tracer

  return { tracer, spans: activeSpans }
}

describe('createOpenTelemetryHttpInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeRequest() {
    return {
      method: 'GET',
      endpoint: '/test',
      baseEndpoint: 'https://api.example.com',
      headers: new Headers(),
    }
  }

  function makeResponse() {
    return {
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      url: 'https://api.example.com/test',
      body: null,
      error: null,
    }
  }

  test('should inject traceparent header via propagator', async () => {
    const { tracer } = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator })

    const req = makeRequest()
    const next = vi.fn(async () => makeResponse())

    await interceptor.fn(req, next)

    expect(propagator.inject).toHaveBeenCalled()
    const calls = (next as unknown as { mock: { calls: [any][] } }).mock.calls
    expect(calls[0]?.[0].headers?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create span with correct name', async () => {
    const { tracer, spans } = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeResponse())

    expect(spans).toHaveLength(1)
    expect(spans[0]?.name).toBe('HTTP GET')
  })

  test('should set span attributes', async () => {
    const { tracer, spans } = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeResponse())

    expect(spans[0]?.attributes['http.request.method']).toBe('GET')
    expect(spans[0]?.attributes['url.full']).toBe('https://api.example.com/test')
  })

  test('should end span on success with OK status', async () => {
    const { tracer, spans } = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator })

    await interceptor.fn(makeRequest(), async () => makeResponse())

    expect(spans[0]?.ended).toBe(true)
    expect(spans[0]?.status?.code).toBe(1) // OK
  })

  test('should record error on exception', async () => {
    const { tracer, spans } = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator })

    await expect(
      interceptor.fn(makeRequest(), async () => {
        throw new Error('network error')
      }),
    ).rejects.toThrow('network error')

    expect(spans[0]?.ended).toBe(true)
    expect(spans[0]?.status?.code).toBe(2) // ERROR
    expect(spans[0]?.recordException).toHaveBeenCalled()
  })

  test('should pass request with headers to next', async () => {
    const { tracer } = createMockTracer()
    const propagator = createMockPropagator()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator })

    const req = makeRequest()
    const next = vi.fn(async () => makeResponse())

    await interceptor.fn(req, next)

    expect(next).toHaveBeenCalledTimes(1)
    const calls = (next as unknown as { mock: { calls: [any][] } }).mock.calls
    expect(calls[0]?.[0].method).toBe('GET')
    expect(calls[0]?.[0].endpoint).toBe('/test')
    expect(calls[0]?.[0].headers).toBeInstanceOf(Headers)
  })
})
