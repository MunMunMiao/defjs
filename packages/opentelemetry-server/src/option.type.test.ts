import type { ClientConfig, EventStreamHandle, HttpRequest, HttpResponse, WebSocketSessionLike } from '@defjs/core'
import { createClient, withEndpoint } from '@defjs/core'
import type { Meter, Span, TextMapPropagator, Tracer } from '@opentelemetry/api'
import type { OpenTelemetryServerHttpOptions, OpenTelemetryServerSSEOptions, OpenTelemetryServerWebSocketOptions } from './option'
import { withOpenTelemetryServer } from './option'

function noop(): void {
  return undefined
}

function makeSpan(): Span {
  const span: Span = {
    spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0, isRemote: false }),
    setAttribute() {
      return this
    },
    setAttributes() {
      return this
    },
    addEvent() {
      return this
    },
    addLink() {
      return this
    },
    addLinks() {
      return this
    },
    setStatus() {
      return this
    },
    updateName() {
      return this
    },
    end: noop,
    isRecording() {
      return false
    },
    recordException: noop,
  }
  return span
}

function makeTracer(): Tracer {
  return {
    startSpan: () => makeSpan(),
    startActiveSpan: () => {
      throw new Error('not implemented')
    },
  }
}

function makeMeter(): Meter {
  return {
    createCounter: () => ({ add: noop }),
    createHistogram: () => ({ record: noop }),
    createGauge: () => ({ record: noop }),
    createUpDownCounter: () => ({ add: noop }),
    createObservableCounter: () => ({ addCallback: noop, removeCallback: noop }),
    createObservableGauge: () => ({ addCallback: noop, removeCallback: noop }),
    createObservableUpDownCounter: () => ({ addCallback: noop, removeCallback: noop }),
    addBatchObservableCallback: noop,
    removeBatchObservableCallback: noop,
  }
}

function makePropagator(): TextMapPropagator {
  return {
    inject: noop,
    extract: (ctx) => ctx,
    fields: () => [],
  }
}

// ---- compile-time type constraints ----

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

// withOpenTelemetryServer returns a ClientOption
const option = withOpenTelemetryServer({ tracer: makeTracer() })
type OptionIsCallable = Expect<Equal<typeof option, (config: ClientConfig) => void>>

// All new options accepted
const fullOption = withOpenTelemetryServer({
  tracer: makeTracer(),
  meter: makeMeter(),
  propagator: makePropagator(),
  requireParentSpan: true,
  http: {
    enabled: true,
    requestHook: noop,
    responseHook: noop,
  },
  sse: {
    enabled: true,
    requestHook: noop,
    responseHook: noop,
  },
  webSocket: {
    enabled: true,
    queryPropagation: true,
    requestHook: noop,
    responseHook: noop,
  },
})

type FullOptionType = Expect<Equal<typeof fullOption, typeof option>>

// Transport toggles
withOpenTelemetryServer({
  tracer: makeTracer(),
  http: { enabled: false },
  sse: { enabled: false },
  webSocket: { enabled: false },
})

// Empty transport config means enabled by default
withOpenTelemetryServer({ tracer: makeTracer(), http: {}, sse: {}, webSocket: {} })

// Used with createClient
createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer: makeTracer() }))

type HttpResponseHook = NonNullable<OpenTelemetryServerHttpOptions['responseHook']>
type SSEResponseHook = NonNullable<OpenTelemetryServerSSEOptions['responseHook']>
type WebSocketResponseHook = NonNullable<OpenTelemetryServerWebSocketOptions['responseHook']>

type HttpResponseArg = Expect<Equal<Parameters<HttpResponseHook>[1], HttpResponse<unknown>>>
type SSEResponseArg = Expect<Equal<Parameters<SSEResponseHook>[1], EventStreamHandle<unknown>>>
type WebSocketResponseArg = Expect<Equal<Parameters<WebSocketResponseHook>[1], WebSocketSessionLike>>
type HttpResponseRequestArg = Expect<Equal<Parameters<HttpResponseHook>[2], HttpRequest>>
type SSEResponseRequestArg = Expect<Equal<Parameters<SSEResponseHook>[2], HttpRequest>>
type WebSocketResponseRequestArg = Expect<Equal<Parameters<WebSocketResponseHook>[2], HttpRequest>>

// Hook parameter types stay transport-specific.
type HttpRequestHook = NonNullable<OpenTelemetryServerHttpOptions['requestHook']>
type SSERequestHook = NonNullable<OpenTelemetryServerSSEOptions['requestHook']>
type WebSocketRequestHook = NonNullable<OpenTelemetryServerWebSocketOptions['requestHook']>
type HttpRequestArg = Expect<Equal<Parameters<HttpRequestHook>[1], HttpRequest>>
type HttpRequestHookResult = Expect<Equal<ReturnType<HttpRequestHook>, Promise<void> | void>>
type HttpResponseHookResult = Expect<Equal<ReturnType<HttpResponseHook>, Promise<void> | void>>
type SSERequestHookResult = Expect<Equal<ReturnType<SSERequestHook>, Promise<void> | void>>
type SSEResponseHookResult = Expect<Equal<ReturnType<SSEResponseHook>, Promise<void> | void>>
type WebSocketRequestHookResult = Expect<Equal<ReturnType<WebSocketRequestHook>, Promise<void> | void>>
type WebSocketResponseHookResult = Expect<Equal<ReturnType<WebSocketResponseHook>, Promise<void> | void>>

// @ts-expect-error tracer is required
withOpenTelemetryServer({})

// @ts-expect-error invalid key — excess property checking on object literal
withOpenTelemetryServer({ tracer: makeTracer(), unknownKey: true })

// @ts-expect-error old top-level requestHook is not supported
withOpenTelemetryServer({ tracer: makeTracer(), requestHook: noop })

// @ts-expect-error old top-level responseHook is not supported
withOpenTelemetryServer({ tracer: makeTracer(), responseHook: noop })

// @ts-expect-error old top-level webSocketQueryPropagation is not supported
withOpenTelemetryServer({ tracer: makeTracer(), webSocketQueryPropagation: true })

// @ts-expect-error old boolean HTTP toggle is not supported
withOpenTelemetryServer({ tracer: makeTracer(), http: false })

// @ts-expect-error old boolean SSE toggle is not supported
withOpenTelemetryServer({ tracer: makeTracer(), sse: false })

// @ts-expect-error old boolean WebSocket toggle is not supported
withOpenTelemetryServer({ tracer: makeTracer(), webSocket: false })

// @ts-expect-error queryPropagation belongs to webSocket options only
withOpenTelemetryServer({ tracer: makeTracer(), http: { queryPropagation: true } })

// @ts-expect-error queryPropagation belongs to webSocket options only
withOpenTelemetryServer({ tracer: makeTracer(), sse: { queryPropagation: true } })

export type Cases =
  | OptionIsCallable
  | FullOptionType
  | HttpResponseArg
  | SSEResponseArg
  | WebSocketResponseArg
  | HttpResponseRequestArg
  | SSEResponseRequestArg
  | WebSocketResponseRequestArg
  | HttpRequestArg
  | HttpRequestHookResult
  | HttpResponseHookResult
  | SSERequestHookResult
  | SSEResponseHookResult
  | WebSocketRequestHookResult
  | WebSocketResponseHookResult
