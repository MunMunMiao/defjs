import { resolveClientConfig } from '../client/client'
import type { Client } from '../client/resolve'
import { createDefinitionError, createRequestRuntimeError, ERR_ABORTED, type RequestError } from '../error'
import { makeSSEInterceptorChain, resolveSSEInterceptors, type SSEHandler } from '../interceptor/interceptor'
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
import type { HttpContext } from '../internal/context'
import { type EndpointInput, type ParsedInput, parseEndpointInput } from '../internal/endpoint_input'
import type { SettledResponse } from '../internal/http_response'
import type { RequestBuilder, RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { createEventStreamRequest } from './request'
import type { EventStreamHandle, EventStreamOpenInfo } from './transport/event_stream'
import { fetchEventStream, getErrorOpenInfo } from './transport/event_stream'
import type { EventStreamMessage } from './transport/parser'

interface UseEventStreamBaseConfig {
  client?: Client
  context?: HttpContext
}

export type UseEventStreamConfig = UseEventStreamBaseConfig & UseCancellationConfig

export type EventSchemas = Record<string, AnyStruct>

type KnownEventKey<TEvents extends EventSchemas> = Exclude<Extract<keyof TEvents, string>, 'default'>

type KnownEventUnion<TEvents extends EventSchemas> = {
  [K in KnownEventKey<TEvents>]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[KnownEventKey<TEvents>]

type DefaultEventUnion<TEvents extends EventSchemas> = 'default' extends keyof TEvents
  ? {
      data: Infer<TEvents['default']>
      event: string
      id?: string
      retry?: number
    }
  : {
      data: string
      event: string
      id?: string
      retry?: number
    }

export type EventStreamData<TEvents extends EventSchemas> = KnownEventUnion<TEvents> | DefaultEventUnion<TEvents>

export interface EventStreamDefinition<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas> {
  build?: RequestBuildHandler<TInput, 'sse'>
  events: TEvents
  input?: TInput
  method?: string
  path: string
}

export interface StreamOpenInfo {
  response?: SettledResponse<null>
  url?: string
}

export type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]

export interface EventStreamRef<TEvent = unknown> extends PromiseLike<StreamAwaitResult<TEvent>> {
  readonly error?: RequestError<unknown>
  readonly open?: StreamOpenInfo
  readonly status: 'aborted' | 'closed' | 'connecting' | 'error' | 'idle' | 'open'
  close(reason?: unknown): void
  with(config: UseEventStreamConfig): EventStreamRef<TEvent>
}

type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<NonNullable<TInput>>
    ? true
    : false

export type UseEventStreamEndpointFn<TInput extends AnyStruct | undefined, TEvents extends EventSchemas> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => EventStreamRef<EventStreamData<TEvents>>
    : (input: EndpointInput<TInput>) => EventStreamRef<EventStreamData<TEvents>>

interface EventStreamEndpoint<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas>
  extends EventStreamDefinition<TInput, TEvents> {
  readonly kind: 'event-stream'
  readonly method: string
}

type StreamRefState<TEvent> = {
  error?: RequestError<unknown>
  open?: StreamOpenInfo
  promise?: Promise<StreamAwaitResult<TEvent>>
  status: EventStreamRef<TEvent>['status']
  stream?: EventStreamHandle<TEvent>
}

export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinition<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents> {
  const endpoint: EventStreamEndpoint<TInput, TEvents> = {
    ...definition,
    kind: 'event-stream' as const,
    method: definition.method ?? 'GET',
  }

  return ((input?: EndpointInput<TInput>) => createEventStreamRef(endpoint, input)) as UseEventStreamEndpointFn<TInput, TEvents>
}

function createEventStreamRef<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config?: UseEventStreamConfig,
): EventStreamRef<EventStreamData<TEvents>> {
  const controller = new AbortController()
  const state: StreamRefState<EventStreamData<TEvents>> = {
    status: 'idle',
  }

  const getPromise = (): Promise<StreamAwaitResult<EventStreamData<TEvents>>> => {
    if (!state.promise) {
      state.promise = executeEventStreamEndpoint(endpoint, input, config ?? {}, controller, state)
    }

    return state.promise
  }

  return {
    get error() {
      return state.error
    },
    get open() {
      return state.open
    },
    get status() {
      return state.status
    },
    close(reason?: unknown) {
      controller.abort(reason)
      state.stream?.close(reason)
    },
    with(nextConfig: UseEventStreamConfig) {
      return createEventStreamRef(endpoint, input, nextConfig)
    },
    then(onfulfilled, onrejected) {
      return getPromise().then(onfulfilled, onrejected)
    },
  }
}

async function executeEventStreamEndpoint<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config: UseEventStreamConfig,
  controller: AbortController,
  state: StreamRefState<EventStreamData<TEvents>>,
): Promise<StreamAwaitResult<EventStreamData<TEvents>>> {
  state.status = 'connecting'

  if (hasAbortTimeoutConflict(config)) {
    const definitionError = createAbortTimeoutConflictError()
    state.error = definitionError
    state.status = 'error'
    return [definitionError, undefined, undefined]
  }

  // Fast path: caller already aborted before we did any schema work.
  if (config.abort?.aborted) {
    /* istanbul ignore next -- unreachable: AbortController always sets a default reason */
    const transportError = createRequestRuntimeError(config.abort.reason ?? ERR_ABORTED)
    state.error = transportError
    state.status = 'aborted'
    return [transportError, undefined, undefined]
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    state.status = 'error'
    return [definitionError, undefined, undefined]
  }

  let clientConfig
  try {
    clientConfig = resolveClientConfig(config.client)
  } catch (error) {
    const transportError = createRequestRuntimeError(error)
    state.error = transportError
    /* istanbul ignore next -- unreachable: resolveClientConfig never throws ERR_ABORTED */
    state.status = transportError.kind === 'transport' && transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError, undefined, undefined]
  }

  let request
  try {
    request = createEventStreamRequest(
      endpoint.method,
      endpoint.path,
      parsedInput,
      endpoint.build as ((request: RequestBuilder, input: unknown) => void) | undefined,
      {
        abort: mergeAbortSignals(controller.signal, [config.abort], config.timeout),
        baseEndpoint: clientConfig.endpoint,
        context: config.context,
        input: endpoint.input,
        queryParamsSerializer: clientConfig.queryParamsSerializer,
        withCredentials: clientConfig.withCredentials,
      },
    )
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    state.status = 'error'
    return [definitionError, undefined, undefined]
  }

  try {
    const sseInterceptors = resolveSSEInterceptors(clientConfig.interceptors)
    const sseHandler: SSEHandler = req =>
      fetchEventStream(req, {
        fetch: clientConfig.sse.fetch,
        async transformMessage(message) {
          return await transformStreamMessage(endpoint.events, message)
        },
      }) as Promise<EventStreamHandle<unknown>>
    const sseChain = makeSSEInterceptorChain(sseInterceptors)
    const stream = (await sseChain(request, sseHandler)) as EventStreamHandle<EventStreamData<TEvents>>

    state.stream = stream
    state.open = normalizeOpenInfo(stream.open)
    state.status = 'open'

    void stream.closed.then(closeInfo => {
      if (closeInfo.code === 'aborted') {
        state.status = 'aborted'
        /* istanbul ignore next -- unreachable: state.error is never set before stream resolves */
        if (!state.error) {
          state.error = createRequestRuntimeError(closeInfo.cause ?? ERR_ABORTED)
        }
        return
      }
      /* istanbul ignore next -- unreachable: stream error is caught by outer try/catch */
      if (closeInfo.code === 'error') {
        state.status = 'error'
        if (!state.error) {
          state.error = createRequestRuntimeError(closeInfo.cause, state.open?.response)
        }
        return
      }
      state.status = 'closed'
    })

    return [null, stream, state.open as StreamOpenInfo]
  } catch (error) {
    const openInfo = normalizeOpenInfo(extractOpenInfo(error))
    const normalizedError = createRequestRuntimeError(error, openInfo?.response)
    state.error = normalizedError
    state.open = openInfo
    state.status = normalizedError.kind === 'transport' && normalizedError.code === 'ABORTED' ? 'aborted' : 'error'
    return [normalizedError, undefined, openInfo]
  }
}

async function transformStreamMessage<TEvents extends EventSchemas>(
  events: TEvents,
  message: EventStreamMessage,
): Promise<EventStreamData<TEvents> | undefined> {
  const eventName = message.event || 'message'
  const eventSchema = resolveEventSchema(events, eventName)
  const rawData = decodeEventData(message.data)

  if (!eventSchema) {
    return undefined
  }

  try {
    return {
      data: await parseEventData(eventSchema, rawData),
      event: eventName,
      id: message.id || undefined,
      retry: message.retry,
    } as EventStreamData<TEvents>
  } catch {
    return undefined
  }
}

function resolveEventSchema<TEvents extends EventSchemas>(events: TEvents, eventName: string): AnyStruct | undefined {
  const exact = events[eventName]
  if (exact) {
    return exact
  }

  const fallback = events['default']
  if (fallback) {
    return fallback
  }

  return undefined
}

async function parseEventData(schema: AnyStruct, data: unknown): Promise<unknown> {
  return decodeJson(schema, data)
}

function decodeEventData(data: string): unknown {
  if (!data) {
    return data
  }

  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function normalizeOpenInfo(open?: {
  response: { error?: unknown; headers: Headers; status: number; statusText: string; url: string }
  url: string
}): StreamOpenInfo | undefined {
  if (!open) {
    return undefined
  }

  return {
    response: {
      body: null,
      ...open.response,
      ok: open.response.status >= 200 && open.response.status < 300,
    },
    url: open.url,
  }
}

function extractOpenInfo(error: unknown): EventStreamOpenInfo | undefined {
  return getErrorOpenInfo(error)
}
