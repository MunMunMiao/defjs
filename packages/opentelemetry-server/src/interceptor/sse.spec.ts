import type { FnReturn } from '../utility_types'
import type { HttpRequest } from '@defjs/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  activeSpans,
  createMockMetrics,
  createMockPropagator,
  createMockTracer,
  makeDeferredSSEStream,
  makeSSERequest,
  makeSSEStream,
  waitForSettledPromises,
} from '../test-utils'
import { createOpenTelemetrySSEInterceptor } from './sse'

let mockPropagator: FnReturn<typeof createMockPropagator>

describe('createOpenTelemetrySSEInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPropagator = createMockPropagator()
  })

  test('should inject traceparent header via propagator', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    const req = makeSSERequest()
    const next = vi.fn(async (_req: HttpRequest) => makeSSEStream())

    await interceptor.fn(req, next)

    expect(mockPropagator.inject).toHaveBeenCalled()
    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].headers?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create span with correct name', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeSSERequest(), async () => makeSSEStream())

    expect(activeSpans).toHaveLength(1)
    expect(activeSpans[0]?.name).toBe('SSE')
  })

  test('should set url.full attribute', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeSSERequest(), async () => makeSSEStream())

    expect(activeSpans[0]?.attributes['url.full']).toBe('https://api.example.com/events')
  })

  test('should add sse.connected event on success', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeSSERequest(), async () => makeSSEStream())

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('sse.connected')
  })

  test('should keep span open until stream.closed settles', async () => {
    const { tracer } = createMockTracer()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)

    expect(activeSpans[0]?.ended).toBe(false)

    stream.close()
    await waitForSettledPromises()

    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record sse.closed and end span when stream closes normally', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)
    stream.close('eof')
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('sse.closed', { 'sse.close.code': 'eof' })
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'success',
        'server.address': 'api.example.com',
        'sse.close.code': 'eof',
      }),
    )
  })

  test('should record sse.aborted without marking span as error', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)
    stream.close('aborted')
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('sse.aborted', { 'sse.close.code': 'aborted' })
    expect(activeSpans[0]?.recordException).not.toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'success',
        'sse.close.code': 'aborted',
      }),
    )
  })

  test('should record error when stream closes with error code', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)
    stream.close('error', new Error('stream broken'))
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('sse.error', { 'sse.close.code': 'error' })
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(2)
    expect(activeSpans[0]?.ended).toBe(true)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'error',
        'error.type': 'Error',
        'sse.close.code': 'error',
      }),
    )
  })

  test('should record error when stream.closed rejects', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)
    stream.reject(new TypeError('rejected'))
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('sse.error', { 'error.type': 'TypeError' })
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(2)
    expect(activeSpans[0]?.ended).toBe(true)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'error',
        'error.type': 'TypeError',
      }),
    )
  })

  test('should record error on next() exception', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator, metrics })

    await expect(
      interceptor.fn(makeSSERequest(), async () => {
        throw new TypeError('connect failed')
      }),
    ).rejects.toThrow('connect failed')

    expect(activeSpans[0]?.ended).toBe(true)
    expect(activeSpans[0]?.status?.code).toBe(2) // ERROR
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()
    expect(metrics.connectDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'error',
        'error.type': 'TypeError',
      }),
    )
    expect(metrics.activeStreams.add).not.toHaveBeenCalled()
  })

  test('should skip span creation when requireParentSpan and no active span', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      requireParentSpan: true,
    })

    const next = vi.fn(async (_req: HttpRequest) => makeSSEStream())
    await interceptor.fn(makeSSERequest(), next)

    expect(activeSpans).toHaveLength(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('should call requestHook before request', async () => {
    const { tracer } = createMockTracer()
    const requestHook = vi.fn()
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      requestHook,
    })

    const req = makeSSERequest()
    await interceptor.fn(req, async () => makeSSEStream())

    expect(requestHook).toHaveBeenCalledTimes(1)
    expect(requestHook).toHaveBeenCalledWith(activeSpans[0], req)
  })

  test('should call responseHook after stream returned', async () => {
    const { tracer } = createMockTracer()
    const responseHook = vi.fn()
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      responseHook,
    })

    const stream = makeSSEStream()
    await interceptor.fn(makeSSERequest(), async () => stream)

    expect(responseHook).toHaveBeenCalledTimes(1)
    expect(responseHook).toHaveBeenCalledWith(activeSpans[0], stream)
  })

  test('should keep stream open when requestHook throws', async () => {
    const { tracer } = createMockTracer()
    const stream = makeDeferredSSEStream()
    const requestHook = vi.fn(() => {
      throw new Error('hook failed')
    })
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      requestHook,
    })

    const result = await interceptor.fn(makeSSERequest(), async () => stream.stream)

    expect(result).toBe(stream.stream)
    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('defjs.otel.hook.error', expect.objectContaining({ 'hook.name': 'requestHook' }))
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()

    stream.close()
    await waitForSettledPromises()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should keep stream open when responseHook throws', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const responseHook = vi.fn(() => {
      throw new Error('hook failed')
    })
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
      responseHook,
    })

    const result = await interceptor.fn(makeSSERequest(), async () => stream.stream)

    expect(result).toBe(stream.stream)
    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('defjs.otel.hook.error', expect.objectContaining({ 'hook.name': 'responseHook' }))
    expect(metrics.connectDuration.record).toHaveBeenCalled()

    stream.close()
    await waitForSettledPromises()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record connect duration and active streams on success', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)

    expect(metrics.connectDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'success',
        'server.address': 'api.example.com',
      }),
    )
    expect(metrics.activeStreams.add).toHaveBeenCalledWith(1, expect.objectContaining({ 'server.address': 'api.example.com' }))
  })

  test('should decrement active streams exactly once when stream closes', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)
    stream.close()
    await waitForSettledPromises()
    stream.close()
    await waitForSettledPromises()

    expect(metrics.activeStreams.add).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ 'server.address': 'api.example.com' }))
    expect(metrics.activeStreams.add).toHaveBeenNthCalledWith(2, -1, expect.objectContaining({ 'server.address': 'api.example.com' }))
    expect(metrics.activeStreams.add).toHaveBeenCalledTimes(2)
  })

  test('should keep metric attributes low-cardinality', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const stream = makeDeferredSSEStream()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeSSERequest(), async () => stream.stream)

    const call = vi.mocked(metrics.connectDuration.record).mock.calls[0]
    const attributes = call?.[1]

    expect(attributes).toEqual(expect.objectContaining({ 'server.address': 'api.example.com' }))
    expect(attributes).not.toHaveProperty('url.full')
    expect(attributes).not.toHaveProperty('traceparent')
  })

  test('should fall back to endpoint on invalid baseEndpoint', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeSSERequest(), baseEndpoint: 'not-a-url' }
    await interceptor.fn(req, async () => makeSSEStream())

    expect(activeSpans[0]?.attributes['url.full']).toBe('/events')
  })

  test('should reuse existing Headers when req.headers is already Headers', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    const existingHeaders = new Headers({ 'x-custom': 'value' })
    const req = { ...makeSSERequest(), headers: existingHeaders }
    const next = vi.fn(async (_req: HttpRequest) => makeSSEStream())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0]?.headers).toBe(existingHeaders)
    expect(calls[0]?.[0]?.headers?.get('x-custom')).toBe('value')
    expect(calls[0]?.[0]?.headers?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should create Headers when req.headers is undefined', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetrySSEInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeSSERequest(), headers: undefined }
    const next = vi.fn(async (_req: HttpRequest) => makeSSEStream())

    await interceptor.fn(req, next)

    expect(mockPropagator.extract).toHaveBeenCalledWith(expect.anything(), expect.any(Headers), expect.anything())
    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0]?.headers).toBeInstanceOf(Headers)
    expect(calls[0]?.[0]?.headers?.get('traceparent')).toBe('mock-trace-id')
  })
})
