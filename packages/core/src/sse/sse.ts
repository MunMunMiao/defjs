import { COMMAND_TYPE, EVENT_STREAM_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'
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
import { makeResponse, toSettledResponse } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { createEventStreamRequest } from './request'
import type { EventStreamHandle, EventStreamOpenInfo } from './transport/event_stream'
import { fetchEventStream, getErrorOpenInfo } from './transport/event_stream'
import type { EventStreamMessage } from './transport/parser'

interface UseEventStreamBaseConfig {
  context?: HttpContext
}

export type EventStructs = { [key: string]: AnyStruct }

type KnownEventUnion<TEvents extends EventStructs> = {
  [K in keyof TEvents & string as K extends 'default' ? never : K]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
} extends infer O
  ? O[keyof O]
  : never

type DefaultEventUnion<TEvents extends EventStructs> = 'default' extends keyof TEvents
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

export type EventStreamData<TEvents extends EventStructs> = KnownEventUnion<TEvents> | DefaultEventUnion<TEvents>

interface EventStreamDefinitionBase<TEvents extends EventStructs = EventStructs> {
  events: TEvents
  method?: string
  path: string
}

type EventStreamDefinitionWithoutBuild<
  TInput extends AnyStruct | undefined = undefined,
  TEvents extends EventStructs = EventStructs,
> = EventStreamDefinitionBase<TEvents> & {
  build?: never
  input?: TInput
}

type EventStreamDefinitionWithBuild<
  TInput extends AnyStruct,
  TEvents extends EventStructs = EventStructs,
> = EventStreamDefinitionBase<TEvents> & {
  build: RequestBuildHandler<TInput, 'sse'>
  input: TInput
}

export type EventStreamDefinition<TInput extends AnyStruct | undefined = undefined, TEvents extends EventStructs = EventStructs> =
  | EventStreamDefinitionWithoutBuild<TInput, TEvents>
  | (TInput extends AnyStruct ? EventStreamDefinitionWithBuild<TInput, TEvents> : never)

export interface StreamOpenInfo {
  response?: SettledResponse<null>
  url?: string
}

export type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]

export interface StreamRefState<TEvent> {
  error?: RequestError<unknown>
  open?: StreamOpenInfo
  promise?: Promise<StreamAwaitResult<TEvent>>
  status: 'aborted' | 'closed' | 'connecting' | 'error' | 'idle' | 'open'
  stream?: EventStreamHandle<TEvent>
}

type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<TInput>
    ? true
    : false

export interface EventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventStructs> extends BaseCommand<
  typeof EVENT_STREAM_COMMAND
> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

export type EventStreamExecuteOptions = UseEventStreamBaseConfig & UseCancellationConfig & { signal?: AbortSignal }

export type EventStreamCommandBuilder<TInput extends AnyStruct | undefined, TEvents extends EventStructs> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => EventStreamCommand<TInput, TEvents>
    : (input: EndpointInput<TInput>) => EventStreamCommand<TInput, TEvents>

type EventStreamEndpoint<
  TInput extends AnyStruct | undefined = undefined,
  TEvents extends EventStructs = EventStructs,
> = EventStreamDefinition<TInput, TEvents> & {
  readonly method: string
}

export function defineEventStream<TInput extends AnyStruct, TEvents extends EventStructs = EventStructs>(
  definition: EventStreamDefinitionWithBuild<TInput, TEvents>,
): EventStreamCommandBuilder<TInput, TEvents>
export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventStructs = EventStructs>(
  definition: EventStreamDefinitionWithoutBuild<TInput, TEvents>,
): EventStreamCommandBuilder<TInput, TEvents>
export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventStructs = EventStructs>(
  definition: EventStreamDefinition<TInput, TEvents>,
): EventStreamCommandBuilder<TInput, TEvents> {
  const endpoint: EventStreamEndpoint<TInput, TEvents> = {
    ...definition,
    method: definition.method ?? 'GET',
  }

  function create(input?: EndpointInput<TInput>): EventStreamCommand<TInput, TEvents> {
    const command: EventStreamCommand<TInput, TEvents> = {
      [COMMAND_TYPE]: EVENT_STREAM_COMMAND,
      endpoint,
      input,
    }

    return command
  }

  return ((input?: EndpointInput<TInput>) => create(input)) as EventStreamCommandBuilder<TInput, TEvents>
}

function castParsedEventStreamInput<TInput extends AnyStruct | undefined>(value: unknown): ParsedInput<TInput> {
  // Type boundary: parseEndpointInput validates with endpoint.input before this helper is called.
  return value as ParsedInput<TInput>
}

export async function executeEventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
  clientConfig: ClientConfig,
  command: EventStreamCommand<TInput, TEvents>,
  options?: EventStreamExecuteOptions,
): Promise<StreamAwaitResult<EventStreamData<TEvents>>> {
  const { endpoint, input } = command
  const config = options ?? {}
  const controller = new AbortController()
  const state: StreamRefState<EventStreamData<TEvents>> = { status: 'idle' }
  return runEventStreamCommand(clientConfig, endpoint, input, config, controller, state)
}

async function runEventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
  clientConfig: ClientConfig,
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config: EventStreamExecuteOptions,
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

  // Fast path: caller already aborted before we did any struct work.
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

  let request
  try {
    request = createEventStreamRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort, config.signal], config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      input: endpoint.input,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      timeout: config.timeout,
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
        fetch: clientConfig.sse.handle,
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

async function transformStreamMessage<TEvents extends EventStructs>(
  events: TEvents,
  message: EventStreamMessage,
  onInvalidEvent?: (context: {
    reason: 'missing-struct' | 'validation-failed'
    message: { id: string; event: string; data: string; retry?: number }
    cause?: unknown
  }) => void | Promise<void>,
): Promise<EventStreamData<TEvents> | undefined> {
  const eventName = message.event || 'message'
  const eventStruct = resolveEventStruct(events, eventName)
  const rawData = decodeEventData(message.data)

  if (!eventStruct) {
    await notifyInvalidEvent(onInvalidEvent, {
      reason: 'missing-struct',
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
      data: await parseEventData(eventStruct, rawData),
      event: eventName,
      id: message.id || undefined,
      retry: message.retry,
      // Type boundary: parseEventData validates against the resolved event struct; the shape matches EventStreamData<TEvents>.
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
  onInvalidEvent:
    | ((context: {
        reason: 'missing-struct' | 'validation-failed'
        message: { id: string; event: string; data: string; retry?: number }
        cause?: unknown
      }) => void | Promise<void>)
    | undefined,
  context: {
    reason: 'missing-struct' | 'validation-failed'
    message: { id: string; event: string; data: string; retry?: number }
    cause?: unknown
  },
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

function resolveEventStruct<TEvents extends EventStructs>(events: TEvents, eventName: string): AnyStruct | undefined {
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

function parseEventData(struct: AnyStruct, data: unknown): unknown {
  return decodeJson(struct, data)
}

function decodeEventData(data: string): unknown {
  if (!data) {
    return data
  }

  try {
    return JSON.parse(data) as unknown
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
    response: toSettledResponse(
      makeResponse({
        body: null,
        ...open.response,
      }),
    ),
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
