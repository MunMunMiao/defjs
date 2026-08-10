import { ERR_ABORTED, type HttpRequest } from '@defjs/core'
import type { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  activeSpans,
  createMockMetrics,
  createMockTracer,
  makeDeferredWsSession,
  makeWsRequest,
  makeWsSession,
  waitForSettledPromises,
} from '../test-utils'
import { createOpenTelemetryWebSocketInterceptor } from './web_socket'

interface QueryCarrier {
  params: URLSearchParams
}

function createMockWsPropagator(): TextMapPropagator {
  return {
    inject: vi.fn((_ctx: Context, carrier: unknown, _setter?: TextMapSetter<unknown>) => {
      if (isQueryCarrier(carrier)) {
        carrier.params.set('traceparent', 'mock-trace-id')
        carrier.params.set('tracestate', 'vendor=value')
        carrier.params.set('baggage', 'tenant=acme')
      }
    }),
    extract: vi.fn((ctx: Context, _carrier?: unknown, _getter?: TextMapGetter<unknown>) => ctx),
    fields: vi.fn(() => ['traceparent', 'tracestate', 'baggage']),
  }
}

function isQueryCarrier(value: unknown): value is QueryCarrier {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'params') instanceof URLSearchParams
}

let mockPropagator: ReturnType<typeof createMockWsPropagator>

describe('createOpenTelemetryWebSocketInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPropagator = createMockWsPropagator()
  })

  test('should extract trace context from headers via propagator', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    const req = makeWsRequest(undefined, new Headers({ traceparent: 'upstream-trace-id' }))
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    expect(mockPropagator.extract).toHaveBeenCalled()
  })

  test('should inject propagation fields into query params when explicitly enabled', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      queryPropagation: true,
    })

    const req = makeWsRequest()
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    expect(mockPropagator.inject).toHaveBeenCalled()
    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].queryParams?.get('traceparent')).toBe('mock-trace-id')
    expect(calls[0]?.[0].queryParams?.get('tracestate')).toBe('vendor=value')
    expect(calls[0]?.[0].queryParams?.get('baggage')).toBe('tenant=acme')
    expect(calls[0]?.[0].queryString).toBe('traceparent=mock-trace-id&tracestate=vendor%3Dvalue&baggage=tenant%3Dacme')
  })

  test('should preserve existing query params when injecting traceparent', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      queryPropagation: true,
    })

    const req = makeWsRequest(new URLSearchParams({ room: 'alpha' }))
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].queryParams?.get('room')).toBe('alpha')
    expect(calls[0]?.[0].queryParams?.get('traceparent')).toBe('mock-trace-id')
  })

  test('should append propagation params without rewriting existing queryString', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      queryPropagation: true,
    })

    const req = {
      ...makeWsRequest(
        new URLSearchParams([
          ['room', 'alpha'],
          ['space', 'hello world'],
        ]),
      ),
      queryString: 'space=hello%20world&room=alpha',
    }
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].queryParams?.get('traceparent')).toBe('mock-trace-id')
    expect(calls[0]?.[0].queryString).toBe(
      'space=hello%20world&room=alpha&traceparent=mock-trace-id&tracestate=vendor%3Dvalue&baggage=tenant%3Dacme',
    )
  })

  test('should create span with correct name', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeWsRequest(), async () => makeWsSession())

    expect(activeSpans).toHaveLength(1)
    expect(activeSpans[0]?.name).toBe('WebSocket')
  })

  test('should set url.full attribute', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeWsRequest(), async () => makeWsSession())

    expect(activeSpans[0]?.attributes['url.full']).toBe('wss://api.example.com/ws')
  })

  test('should add websocket.connected event on success', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeWsRequest(), async () => makeWsSession())

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.connected')
  })

  test('should keep span open until session.closed settles', async () => {
    const { tracer } = createMockTracer()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    await interceptor.fn(makeWsRequest(), async () => ws.session)

    expect(activeSpans[0]?.ended).toBe(false)

    ws.close()
    await waitForSettledPromises()

    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record websocket.closed and end span when session closes normally', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close()
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.closed')
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'success',
        'server.address': 'api.example.com',
      }),
    )
  })

  test('should treat a legacy close info without kind or cause as closed', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close({ code: 1000, reason: 'legacy normal close', wasClean: true } as never)
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.closed')
    expect(activeSpans[0]?.recordException).not.toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ 'defjs.result': 'success' }),
    )
  })

  test('should treat a non-object legacy close result as closed', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close(null as never)
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.closed')
    expect(activeSpans[0]?.recordException).not.toHaveBeenCalled()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ 'defjs.result': 'success' }),
    )
  })

  test('should treat a legacy close info cause as an error', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const closeCause = new TypeError('legacy connection failure')
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close({ cause: closeCause, code: 1006, wasClean: false } as never)
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.error', { 'error.type': 'TypeError' })
    expect(activeSpans[0]?.recordException).toHaveBeenCalledWith(closeCause)
    expect(activeSpans[0]?.status?.code).toBe(2)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ 'defjs.result': 'error', 'error.type': 'TypeError' }),
    )
  })

  test('should record error when session.closed rejects', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.reject(new TypeError('connection lost'))
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.error', { 'error.type': 'TypeError' })
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

  test('should record error when session.closed resolves with a close cause', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close({ code: 1006, cause: new TypeError('connection lost'), kind: 'error', reason: 'abnormal', wasClean: false })
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.error', { 'error.type': 'TypeError' })
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

  test('should record an aborted session without a cause as an error', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close({ kind: 'aborted' })
    await waitForSettledPromises()

    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('websocket.error', { 'error.type': 'Error' })
    expect(activeSpans[0]?.recordException).toHaveBeenCalledWith(ERR_ABORTED)
    expect(activeSpans[0]?.status?.code).toBe(2)
    expect(activeSpans[0]?.ended).toBe(true)
    expect(metrics.connectionDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'error',
        'error.type': 'Error',
      }),
    )
  })

  test('should record error on next() exception', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await expect(
      interceptor.fn(makeWsRequest(), async () => {
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
    expect(metrics.activeConnections.add).not.toHaveBeenCalled()
  })

  test('should skip span creation when requireParentSpan and no active span', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      requireParentSpan: true,
    })

    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())
    await interceptor.fn(makeWsRequest(), next)

    expect(activeSpans).toHaveLength(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('should leave existing query state unchanged when queryPropagation is omitted', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
    })

    const req = {
      ...makeWsRequest(new URLSearchParams({ room: 'alpha' })),
      queryString: 'room=alpha',
    }
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    expect(mockPropagator.inject).not.toHaveBeenCalled()
    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].queryParams?.get('traceparent')).toBeNull()
    expect(calls[0]?.[0].queryParams).toBe(req.queryParams)
    expect(calls[0]?.[0].queryString).toBe('room=alpha')
  })

  test('should keep queryString unchanged when propagator injects nothing', async () => {
    const { tracer } = createMockTracer()
    const noOpPropagator: TextMapPropagator = {
      inject: vi.fn(),
      extract: vi.fn((ctx: Context) => ctx),
      fields: vi.fn(() => []),
    }
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: noOpPropagator,
      queryPropagation: true,
    })

    const req = makeWsRequest(new URLSearchParams({ room: 'alpha' }))
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].queryParams?.get('room')).toBe('alpha')
    expect(calls[0]?.[0].queryString).toBe('room=alpha')
  })

  test('should fall back to empty queryString when missing and nothing injected', async () => {
    const { tracer } = createMockTracer()
    const noOpPropagator: TextMapPropagator = {
      inject: vi.fn(),
      extract: vi.fn((ctx: Context) => ctx),
      fields: vi.fn(() => []),
    }
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: noOpPropagator,
      queryPropagation: true,
    })

    const req = { ...makeWsRequest(), queryString: undefined }
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    const calls = vi.mocked(next).mock.calls
    expect(calls[0]?.[0].queryString).toBe('')
  })

  test('should call requestHook before request', async () => {
    const { tracer } = createMockTracer()
    const requestHook = vi.fn()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      requestHook,
    })

    const req = makeWsRequest()
    await interceptor.fn(req, async () => makeWsSession())

    expect(requestHook).toHaveBeenCalledTimes(1)
    expect(requestHook).toHaveBeenCalledWith(activeSpans[0], req)
  })

  test('should call responseHook after session returned', async () => {
    const { tracer } = createMockTracer()
    const responseHook = vi.fn()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      responseHook,
    })

    const session = makeWsSession()
    await interceptor.fn(makeWsRequest(), async () => session)

    expect(responseHook).toHaveBeenCalledTimes(1)
    expect(responseHook).toHaveBeenCalledWith(activeSpans[0], session)
  })

  test('should keep session open when requestHook throws', async () => {
    const { tracer } = createMockTracer()
    const ws = makeDeferredWsSession()
    const requestHook = vi.fn(() => {
      throw new Error('hook failed')
    })
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      requestHook,
    })

    const result = await interceptor.fn(makeWsRequest(), async () => ws.session)

    expect(result).toBe(ws.session)
    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('defjs.otel.hook.error', expect.objectContaining({ 'hook.name': 'requestHook' }))
    expect(activeSpans[0]?.recordException).toHaveBeenCalled()

    ws.close()
    await waitForSettledPromises()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should keep session open when responseHook throws', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const responseHook = vi.fn(() => {
      throw new Error('hook failed')
    })
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
      responseHook,
    })

    const result = await interceptor.fn(makeWsRequest(), async () => ws.session)

    expect(result).toBe(ws.session)
    expect(activeSpans[0]?.addEvent).toHaveBeenCalledWith('defjs.otel.hook.error', expect.objectContaining({ 'hook.name': 'responseHook' }))
    expect(metrics.connectDuration.record).toHaveBeenCalled()

    ws.close()
    await waitForSettledPromises()
    expect(activeSpans[0]?.status?.code).toBe(1)
    expect(activeSpans[0]?.ended).toBe(true)
  })

  test('should record connect duration and active connections on success', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await interceptor.fn(makeWsRequest(), async () => ws.session)

    expect(metrics.connectDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'defjs.result': 'success',
        'server.address': 'api.example.com',
      }),
    )
    expect(metrics.activeConnections.add).toHaveBeenCalledWith(1, expect.objectContaining({ 'server.address': 'api.example.com' }))
  })

  test('should decrement active connections exactly once when session closes', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({
      tracer,
      propagator: mockPropagator,
      metrics,
    })

    await interceptor.fn(makeWsRequest(), async () => ws.session)
    ws.close()
    await waitForSettledPromises()
    ws.close()
    await waitForSettledPromises()

    expect(metrics.activeConnections.add).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ 'server.address': 'api.example.com' }))
    expect(metrics.activeConnections.add).toHaveBeenNthCalledWith(2, -1, expect.objectContaining({ 'server.address': 'api.example.com' }))
    expect(metrics.activeConnections.add).toHaveBeenCalledTimes(2)
  })

  test('should keep metric attributes low-cardinality', async () => {
    const { tracer } = createMockTracer()
    const metrics = createMockMetrics()
    const ws = makeDeferredWsSession()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator, metrics })

    await interceptor.fn(makeWsRequest(new URLSearchParams({ room: 'alpha' })), async () => ws.session)

    const call = vi.mocked(metrics.connectDuration.record).mock.calls[0]
    const attributes = call?.[1]

    expect(attributes).toEqual(expect.objectContaining({ 'server.address': 'api.example.com' }))
    expect(attributes).not.toHaveProperty('url.full')
    expect(attributes).not.toHaveProperty('traceparent')
    expect(attributes).not.toHaveProperty('queryString')
  })

  test('should fall back to endpoint on invalid baseEndpoint', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeWsRequest(), baseEndpoint: 'not-a-url' }
    await interceptor.fn(req, async () => makeWsSession())

    expect(activeSpans[0]?.attributes['url.full']).toBe('/ws')
  })

  test('should extract from empty Headers when req.headers is undefined', async () => {
    const { tracer } = createMockTracer()
    const interceptor = createOpenTelemetryWebSocketInterceptor({ tracer, propagator: mockPropagator })

    const req = { ...makeWsRequest(), headers: undefined }
    const next = vi.fn(async (_req: HttpRequest) => makeWsSession())

    await interceptor.fn(req, next)

    expect(mockPropagator.extract).toHaveBeenCalledWith(expect.anything(), expect.any(Headers), expect.anything())
    expect(next).toHaveBeenCalledTimes(1)
  })
})
