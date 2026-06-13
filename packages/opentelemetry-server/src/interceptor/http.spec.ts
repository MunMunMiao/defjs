import type { HttpRequest } from '@defjs/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { activeSpans, createMockMetrics, createMockPropagator, createMockTracer, makeHttpRequest, makeHttpResponse } from '../test-utils'
import { createOpenTelemetryHttpInterceptor } from './http'

let mockPropagator: ReturnType<typeof createMockPropagator>

describe('createOpenTelemetryHttpInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPropagator = createMockPropagator()
  })

  test('should inject traceparent header via propagator', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    const req = makeHttpRequest()
    const next = vi.fn(async (_req: HttpRequest) => makeHttpResponse())

    await interceptor.fn(req, next)

    expect(mockPropagator.inject).toHaveBeenCalled()
    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].headers?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create span with correct name', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeHttpRequest(), async () => makeHttpResponse())

    expect(activeSpans).toHaveLength(1)
    expect(activeSpans[0]?.name).toBe('HTTP GET')
  })

  test('should set span attributes', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeHttpRequest(), async () => makeHttpResponse())

    expect(activeSpans[0]?.attributes['http.request.method']).toBe('GET')
    expect(activeSpans[0]?.attributes['url.full']).toBe('https://api.example.com/test')
  })

  test('should end span on success with OK status', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeHttpRequest(), async () => makeHttpResponse())

    expect(activeSpans[0]?.ended).toBe(true)
    expect(activeSpans[0]?.status?.code).toBe(1) // OK
  })

  test('should end span on 5xx status with ERROR', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeHttpRequest(), async () => ({ ...makeHttpResponse(), status: 500 }))

    expect(activeSpans[0]?.ended).toBe(true)
    expect(activeSpans[0]?.status?.code).toBe(2) // ERROR
  })

  test('should end span on 4xx status with OK', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeHttpRequest(), async () => ({ ...makeHttpResponse(), status: 404 }))

    expect(activeSpans[0]?.ended).toBe(true)
    expect(activeSpans[0]?.status?.code).toBe(1) // OK
  })

  test('should record error on exception', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await expect(
      interceptor.fn(makeHttpRequest(), async () => {
        throw new Error('network error')
      }),
    ).rejects.toThrow('network error')

    expect(activeSpans[0]?.ended).toBe(true)
    expect(activeSpans[0]?.status?.code).toBe(2) // ERROR
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
  })

  test('should pass request with headers to next', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    const req = makeHttpRequest()
    const next = vi.fn(async (_req: HttpRequest) => makeHttpResponse())

    await interceptor.fn(req, next)

    expect(next).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].method).toBe('GET')
    expect(calls[0]?.[0].endpoint).toBe('/test')
    expect(calls[0]?.[0].headers).toBeInstanceOf(Headers)
  })

  test('should skip span creation when requireParentSpan and no active span', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      requireParentSpan: true,
    })

    const next = vi.fn(async (_req: HttpRequest) => makeHttpResponse())
    await interceptor.fn(makeHttpRequest(), next)

    expect(activeSpans).toHaveLength(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('should call requestHook before request', async () => {
    const { tracer } = createMockTracer()
    const requestHook = vi.fn()
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      requestHook,
    })

    const req = makeHttpRequest()
    await interceptor.fn(req, async () => makeHttpResponse())

    expect(requestHook).toHaveBeenCalledTimes(1)
    expect(requestHook).toHaveBeenCalledWith(activeSpans[0], req)
  })

  test('should call responseHook before span ends', async () => {
    const { tracer } = createMockTracer()
    const responseHook = vi.fn()
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      responseHook,
    })

    const res = makeHttpResponse()
    await interceptor.fn(makeHttpRequest(), async () => res)

    expect(responseHook).toHaveBeenCalledTimes(1)
    expect(responseHook).toHaveBeenCalledWith(activeSpans[0], res)
    expect(activeSpans[0]?.ended).toBe(true) // span ends after hook
  })

  test('should keep request running when requestHook throws', async () => {
    const { tracer } = createMockTracer()
    const requestHook = vi.fn(() => {
      throw new Error('hook failed')
    })
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      requestHook,
    })

    const response = makeHttpResponse()
    const result = await interceptor.fn(makeHttpRequest(), async () => response)

    expect(result).toBe(response)
    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('defjs.otel.hook.error', expect.objectContaining({ 'hook.name': 'requestHook' }))
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should keep response running when responseHook throws', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const responseHook = vi.fn(() => {
      throw new Error('hook failed')
    })
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
      responseHook,
    })

    const response = makeHttpResponse()
    const result = await interceptor.fn(makeHttpRequest(), async () => response)

    expect(result).toBe(response)
    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('defjs.otel.hook.error', expect.objectContaining({ 'hook.name': 'responseHook' }))
    expect(metrics.requestDuration.record).toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record duration metrics on success', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await interceptor.fn(makeHttpRequest(), async () => makeHttpResponse())

    expect(metrics.requestDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'http.request.method': 'GET',
        'http.response.status_code': 200,
        'server.address': 'api.example.com',
      }),
    )
  })

  test('should record status code on non-2xx metrics', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await interceptor.fn(makeHttpRequest(), async () => ({ ...makeHttpResponse(), status: 500 }))

    expect(metrics.requestDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'http.response.status_code': 500,
      }),
    )
  })

  test('should record error attributes on exception metrics', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetryHttpInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await expect(
      interceptor.fn(makeHttpRequest(), async () => {
        throw new TypeError('fail')
      }),
    ).rejects.toThrow('fail')

    expect(metrics.requestDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'http.request.method': 'GET',
        'error.type': 'TypeError',
      }),
    )
  })

  test('should set server.address and server.port from URL', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeHttpRequest(), async () => makeHttpResponse())

    expect(activeSpans[0]?.attributes['server.address']).toBe('api.example.com')
  })

  test('should set server.port when URL has explicit port', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeHttpRequest(), baseEndpoint: 'https://api.example.com:8443' }
    await interceptor.fn(req, async () => makeHttpResponse())

    expect(activeSpans[0]?.attributes['server.address']).toBe('api.example.com')
    expect(activeSpans[0]?.attributes['server.port']).toBe(8443)
  })

  test('should fall back to endpoint on invalid baseEndpoint', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeHttpRequest(), baseEndpoint: 'not-a-url' }
    await interceptor.fn(req, async () => makeHttpResponse())

    expect(activeSpans[0]?.attributes['url.full']).toBe('/test')
  })

  test('should reuse existing Headers when req.headers is already Headers', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    const existingHeaders = new Headers({ 'x-custom': 'value' })
    const req = { ...makeHttpRequest(), headers: existingHeaders }
    const next = vi.fn(async (_req: HttpRequest) => makeHttpResponse())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0]?.headers).toBe(existingHeaders)
    expect(calls[0]?.[0]?.headers?.get('x-custom')).toBe('value')
    expect(calls[0]?.[0]?.headers?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create new Headers when req.headers is undefined', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryHttpInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeHttpRequest(), headers: undefined }
    const next = vi.fn(async (_req: HttpRequest) => makeHttpResponse())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0]?.headers).toBeInstanceOf(Headers)
    expect(calls[0]?.[0]?.headers?.get('traceparent')).toBe('mock-trace-id')
  })
})
