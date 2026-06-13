import { resolveClientConfig } from '../client/client'
import type { SSEInvalidEventHandler } from '../client/config'
import type { Client } from '../client/resolve'
import type { RequestError } from '../error'
import { createDefinitionError, createTransportError, ERR_ABORTED } from '../error'
import type { SSEHandler } from '../interceptor/interceptor'
import { makeSSEInterceptorChain, resolveSSEInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals } from '../internal/abort'
import type { HttpContext } from '../internal/context'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { SettledResponse } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
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

interface EventStreamDefinitionBase<TEvents extends EventSchemas = EventSchemas> {
  events: TEvents
  method?: string
  path: string
}

type EventStreamDefinitionWithoutBuild<
  TInput extends AnyStruct | undefined = undefined,
  TEvents extends EventSchemas = EventSchemas,
> = EventStreamDefinitionBase<TEvents> & {
  build?: never
  input?: TInput
}

type EventStreamDefinitionWithBuild<
  TInput extends AnyStruct,
  TEvents extends EventSchemas = EventSchemas,
> = EventStreamDefinitionBase<TEvents> & {
  build: RequestBuildHandler<TInput, 'sse'>
  input: TInput
}

export type EventStreamDefinition<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas> =
  | EventStreamDefinitionWithoutBuild<TInput, TEvents>
  | (TInput extends AnyStruct ? EventStreamDefinitionWithBuild<TInput, TEvents> : never)

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

type EventStreamEndpoint<
  TInput extends AnyStruct | undefined = undefined,
  TEvents extends EventSchemas = EventSchemas,
> = EventStreamDefinition<TInput, TEvents> & {
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

function createTypedEventStreamEndpoint<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents> {
  return (input: EndpointInput<TInput> | undefined) => createEventStreamRef(endpoint, input)
}

function castParsedEventStreamInput<TInput extends AnyStruct | undefined>(value: unknown): ParsedInput<TInput> {
  // Type boundary: parseEndpointInput validates with endpoint.input before this helper is called.
  return value as ParsedInput<TInput>
}

export function defineEventStream<TInput extends AnyStruct, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinitionWithBuild<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents>
export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinitionWithoutBuild<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents>
export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinition<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents> {
  const endpoint: EventStreamEndpoint<TInput, TEvents> = {
    ...definition,
    kind: 'event-stream' as const,
    method: definition.method ?? 'GET',
  }

  return createTypedEventStreamEndpoint(endpoint)
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
    const transportError = createTransportError(config.abort.reason ?? ERR_ABORTED)
    state.error = transportError
    state.status = 'aborted'
    return [transportError, undefined, undefined]
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = castParsedEventStreamInput<TInput>(await parseEndpointInput(endpoint.input, input))
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
    const transportError = createTransportError(error)
    state.error = transportError
    /* istanbul ignore next -- unreachable: resolveClientConfig never throws ERR_ABORTED */
    state.status = transportError.kind === 'transport' && transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError, undefined, undefined]
  }

  let request
  try {
    request = createEventStreamRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort], config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      input: endpoint.input,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      withCredentials: clientConfig.withCredentials,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    state.status = 'error'
    return [definitionError, undefined, undefined]
  }

  try {
    const sseInterceptors = resolveSSEInterceptors(clientConfig.interceptors)
    const sseHandler: SSEHandler = (req) =>
      // Type boundary: SSEHandler returns EventStreamHandle<unknown>; the concrete type is narrowed by the interceptor chain.
      fetchEventStream(req, {
        fetch: clientConfig.sse.fetch,
        async transformMessage(message) {
          return await transformStreamMessage(endpoint.events, message, clientConfig.sse.onInvalidEvent)
        },
        reconnect: clientConfig.sse.reconnect,
        queue: clientConfig.sse.queue,
        maxBufferSize: clientConfig.sse.maxBufferSize,
      }) as Promise<EventStreamHandle<unknown>>
    const sseChain = makeSSEInterceptorChain(sseInterceptors)
    // Type boundary: interceptor chain returns EventStreamHandle<unknown>; runtime message transform narrows it to the endpoint's event types.
    const stream = (await sseChain(request, sseHandler)) as EventStreamHandle<EventStreamData<TEvents>>

    state.stream = stream
    state.open = normalizeOpenInfo(stream.open)
    state.status = 'open'

    void stream.closed.then((closeInfo) => {
      if (closeInfo.code === 'aborted') {
        state.status = 'aborted'
        /* istanbul ignore next -- unreachable: state.error is never set before stream resolves */
        if (!state.error) {
          state.error = createTransportError(closeInfo.cause ?? ERR_ABORTED)
        }
        return
      }
      /* istanbul ignore next -- unreachable: stream error is caught by outer try/catch */
      if (closeInfo.code === 'error') {
        state.status = 'error'
        if (!state.error) {
          state.error = createEventStreamRuntimeError(closeInfo.cause, state.open?.response)
        }
        return
      }
      state.status = 'closed'
    })

    // Type boundary: state.open is set by normalizeOpenInfo(stream.open) immediately before this return.
    return [null, stream, state.open as StreamOpenInfo]
  } catch (error) {
    const openInfo = normalizeOpenInfo(extractOpenInfo(error))
    const normalizedError = createEventStreamRuntimeError(error, openInfo?.response)
    state.error = normalizedError
    state.open = openInfo
    state.status = normalizedError.kind === 'transport' && normalizedError.code === 'ABORTED' ? 'aborted' : 'error'
    return [normalizedError, undefined, openInfo]
  }
}

async function transformStreamMessage<TEvents extends EventSchemas>(
  events: TEvents,
  message: EventStreamMessage,
  onInvalidEvent?: SSEInvalidEventHandler,
): Promise<EventStreamData<TEvents> | undefined> {
  const eventName = message.event || 'message'
  const eventSchema = resolveEventSchema(events, eventName)
  const rawData = decodeEventData(message.data)

  if (!eventSchema) {
    await notifyInvalidEvent(onInvalidEvent, {
      reason: 'missing-schema',
      message: {
        id: message.id || '',
        event: eventName,
        data: message.data,
        retry: message.retry,
      },
    })
    return undefined
  }

  try {
    return {
      data: await parseEventData(eventSchema, rawData),
      event: eventName,
      id: message.id || undefined,
      retry: message.retry,
      // Type boundary: parseEventData validates against the resolved event schema; the shape matches EventStreamData<TEvents>.
    } as EventStreamData<TEvents>
  } catch (error) {
    await notifyInvalidEvent(onInvalidEvent, {
      reason: 'validation-failed',
      message: {
        id: message.id || '',
        event: eventName,
        data: message.data,
        retry: message.retry,
      },
      cause: error,
    })
    return undefined
  }
}

async function notifyInvalidEvent(
  onInvalidEvent: SSEInvalidEventHandler | undefined,
  context: Parameters<SSEInvalidEventHandler>[0],
): Promise<void> {
  if (!onInvalidEvent) {
    return
  }

  try {
    await onInvalidEvent(context)
  } catch {
    // onInvalidEvent is an observer; observer failures must not tear down the stream.
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

function parseEventData(schema: AnyStruct, data: unknown): unknown {
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

function createEventStreamRuntimeError(cause: unknown, response?: SettledResponse<unknown>): RequestError<unknown> {
  if (response && !response.ok) {
    return {
      code: 'HTTP_STATUS',
      data: undefined,
      kind: 'http',
      message: getHttpStatusErrorMessage(response),
      response,
      status: response.status,
    }
  }

  if (isEventStreamResponseValidationError(cause)) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', cause, response)
  }

  return createTransportError(cause)
}

function getHttpStatusErrorMessage(response: SettledResponse<unknown>): string {
  /* istanbul ignore else -- makeResponse assigns Error for non-ok responses without an explicit error */
  if (response.error instanceof Error) {
    return response.error.message
  }

  /* istanbul ignore next */
  return String(response.error)
}

function isEventStreamResponseValidationError(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'StructError' || /Expected content-type/.test(cause.message))
}
