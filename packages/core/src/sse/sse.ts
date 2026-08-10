import { COMMAND_TYPE, EVENT_STREAM_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'
import type { RequestError } from '../error'
import { createDefinitionError, createTransportError } from '../error'
import type { SSEHandler } from '../interceptor/interceptor'
import { makeSSEInterceptorChain, resolveSSEInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import {
  awaitWithSignal,
  createAbortTimeoutConflictError,
  hasAbortTimeoutConflict,
  mergeAbortSignals,
  resolveAbortedTransportError,
  snapshotCancellationConfig,
  validateTransportTimeout,
} from '../internal/abort'
import type { HttpContext } from '../internal/context'
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpResponse } from '../internal/http_response'
import { getHttpErrorMessage } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { isStruct } from '../struct/guards'
import { parseStructValue } from '../struct/introspection'
import { DEFINITION } from '../struct/symbols'
import type { RuntimeStruct } from '../struct/types'
import { createEventStreamRequest } from './request'
import type { EventStreamHandle, EventStreamOpenInfo } from './transport/event_stream'
import { fetchEventStream, getErrorOpenInfo, getEventStreamFatalCode } from './transport/event_stream'
import type { EventStreamMessage } from './transport/parser'

interface UseEventStreamBaseConfig {
  context?: HttpContext
}

export type EventStructs = { [key: string]: AnyStruct }

type EventName<TKey extends string | number> = `${TKey}`

type KnownEventUnion<TEvents extends EventStructs> = {
  [K in keyof TEvents & (number | string)]: EventName<K> extends 'default'
    ? never
    : {
        data: Infer<TEvents[K]>
        event: EventName<K>
        id?: string
      }
}[keyof TEvents & (number | string)]

type DefaultEventUnion<TEvents extends EventStructs> = 'default' extends keyof TEvents
  ? {
      data: Infer<TEvents['default']>
      event: string
      id?: string
    }
  : never

export type EventStreamData<TEvents extends EventStructs> = TEvents extends EventStructs
  ? KnownEventUnion<TEvents> | DefaultEventUnion<TEvents>
  : never

interface EventStreamDefinitionBase<TEvents extends EventStructs = EventStructs> {
  events: TEvents
  maxBufferSize: number
  maxQueueSize: number
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
  response?: HttpResponse<null>
  url?: string
}

export type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]

export interface EventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventStructs> extends BaseCommand<
  typeof EVENT_STREAM_COMMAND
> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

export type EventStreamExecuteOptions = UseEventStreamBaseConfig & UseCancellationConfig & { signal?: AbortSignal }

export type EventStreamCommandBuilder<TInput extends AnyStruct | undefined, TEvents extends EventStructs> = EndpointCommandBuilder<
  TInput,
  EventStreamCommand<TInput, TEvents>
>

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
  return runEventStreamCommand(clientConfig, endpoint, input, config, controller)
}

async function runEventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventStructs>(
  clientConfig: ClientConfig,
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config: EventStreamExecuteOptions,
  controller: AbortController,
): Promise<StreamAwaitResult<EventStreamData<TEvents>>> {
  let cancellation
  try {
    cancellation = snapshotCancellationConfig(config)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return [definitionError, undefined, undefined]
  }

  if (hasAbortTimeoutConflict(cancellation)) {
    const definitionError = createAbortTimeoutConflictError()
    return [definitionError, undefined, undefined]
  }

  try {
    validateTransportTimeout(cancellation.timeout)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return [definitionError, undefined, undefined]
  }

  // Fast path: caller already aborted before we did any struct work.
  const preAbortedSignal = [cancellation.abort, cancellation.signal].find((signal) => signal?.aborted)
  if (preAbortedSignal) {
    const transportError = resolveAbortedTransportError(preAbortedSignal)
    return [transportError, undefined, undefined]
  }

  try {
    validateEventStreamLimits(endpoint)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return [definitionError, undefined, undefined]
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = castParsedEventStreamInput<TInput>(await parseEndpointInput(endpoint.input, input))
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return [definitionError, undefined, undefined]
  }

  const requestSignal = mergeAbortSignals(controller.signal, [cancellation.abort, cancellation.signal], cancellation.timeout)
  let request
  try {
    request = createEventStreamRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: requestSignal,
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      input: endpoint.input,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      timeout: cancellation.timeout,
      withCredentials: clientConfig.withCredentials,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return [definitionError, undefined, undefined]
  }

  type OwnedStream = {
    controller: AbortController
    stream?: EventStreamHandle<unknown>
  }
  let chainSettled = false
  const ownedStreams = new Set<OwnedStream>()
  try {
    const sseInterceptors = resolveSSEInterceptors(clientConfig.interceptors)
    const sseHandler: SSEHandler = (req) => {
      if (chainSettled) {
        const rejected = Promise.reject<EventStreamHandle<unknown>>(
          new Error('SSE interceptor next() cannot be called after the chain has settled'),
        )
        void rejected.catch(() => undefined)
        return rejected
      }
      const ownerController = new AbortController()
      const owned: OwnedStream = {
        controller: ownerController,
      }
      ownedStreams.add(owned)
      // Type boundary: SSEHandler returns EventStreamHandle<unknown>; the concrete type is narrowed by the interceptor chain.
      const promise = fetchEventStream(
        { ...req, abort: mergeAbortSignals(ownerController.signal, [req.abort]) },
        {
          fetch: clientConfig.sse.handle,
          async transformMessage(message, signal) {
            return await transformStreamMessage(endpoint.events, message, clientConfig.sse.onInvalidEvent, signal)
          },
          reconnect: clientConfig.sse.reconnect,
          maxBufferSize: endpoint.maxBufferSize,
          maxQueueSize: endpoint.maxQueueSize,
        },
      ).then((stream) => {
        owned.stream = stream
        return stream
      })
      void promise.catch(() => undefined)
      return promise
    }
    const sseChain = makeSSEInterceptorChain(sseInterceptors)
    // Type boundary: interceptor chain returns EventStreamHandle<unknown>; runtime message transform narrows it to the endpoint's event types.
    const stream = (await awaitWithSignal(() => sseChain(request, sseHandler), requestSignal)) as EventStreamHandle<
      EventStreamData<TEvents>
    >
    chainSettled = true

    const open = normalizeOpenInfo(stream.open) as StreamOpenInfo

    discardOwnedStreams(new Error('SSE interceptor discarded an opened stream'), stream)

    return [null, stream, open]
  } catch (error) {
    chainSettled = true
    discardOwnedStreams(error)

    const openInfo = normalizeOpenInfo(extractOpenInfo(error))
    const normalizedError = requestSignal.aborted
      ? resolveAbortedTransportError(requestSignal)
      : createEventStreamRuntimeError(error, openInfo?.response)
    return [normalizedError, undefined, openInfo]
  }

  function discardOwnedStreams(reason: unknown, delivered?: EventStreamHandle<unknown>): void {
    for (const owned of ownedStreams) {
      if (owned.stream && delivered && (owned.stream === delivered || owned.stream.closed === delivered.closed)) {
        continue
      }
      owned.controller.abort(reason)
      owned.stream?.close(reason)
    }
    ownedStreams.clear()
  }
}

async function transformStreamMessage<TEvents extends EventStructs>(
  events: TEvents,
  message: EventStreamMessage,
  onInvalidEvent:
    | ((context: {
        reason: 'missing-struct' | 'validation-failed'
        message: { id: string; event: string; data: string }
        cause?: unknown
        signal: AbortSignal
      }) => void | Promise<void>)
    | undefined,
  signal: AbortSignal,
): Promise<EventStreamData<TEvents> | undefined> {
  const eventName = message.event || 'message'
  const eventStruct = resolveEventStruct(events, eventName)

  if (!eventStruct) {
    await notifyInvalidEvent(onInvalidEvent, {
      reason: 'missing-struct',
      message: {
        id: message.id || '',
        event: eventName,
        data: message.data,
      },
      signal,
    })
    return undefined
  }

  try {
    return {
      data: await parseEventData(eventStruct, message.data),
      event: eventName,
      id: message.id || undefined,
      // Type boundary: parseEventData validates against the resolved event struct; the shape matches EventStreamData<TEvents>.
    } as EventStreamData<TEvents>
  } catch (error) {
    await notifyInvalidEvent(onInvalidEvent, {
      reason: 'validation-failed',
      message: {
        id: message.id || '',
        event: eventName,
        data: message.data,
      },
      cause: error,
      signal,
    })
    return undefined
  }
}

async function notifyInvalidEvent(
  onInvalidEvent:
    | ((context: {
        reason: 'missing-struct' | 'validation-failed'
        message: { id: string; event: string; data: string }
        cause?: unknown
        signal: AbortSignal
      }) => void | Promise<void>)
    | undefined,
  context: {
    reason: 'missing-struct' | 'validation-failed'
    message: { id: string; event: string; data: string }
    cause?: unknown
    signal: AbortSignal
  },
): Promise<void> {
  if (!onInvalidEvent) {
    return
  }

  try {
    await awaitWithSignal(() => onInvalidEvent(context), context.signal)
  } catch (error) {
    if (context.signal.aborted) {
      throw error
    }
    // onInvalidEvent is an observer; observer failures must not tear down the stream.
  }
}

function validateEventStreamLimits(endpoint: { maxBufferSize: number; maxQueueSize: number }): void {
  for (const name of ['maxBufferSize', 'maxQueueSize'] as const) {
    if (!Number.isSafeInteger(endpoint[name]) || endpoint[name] < 1) {
      throw new TypeError(`SSE ${name} must be a positive safe integer`)
    }
  }
}

function resolveEventStruct<TEvents extends EventStructs>(events: TEvents, eventName: string): AnyStruct | undefined {
  if (Object.hasOwn(events, eventName)) {
    return events[eventName]
  }

  // JavaScript treats an object-literal __proto__ field as the object's prototype instead of an own property.
  if (eventName === '__proto__') {
    const prototype = Object.getPrototypeOf(events) as unknown
    if (isStruct(prototype)) {
      return prototype
    }
  }

  if (Object.hasOwn(events, 'default')) {
    return events['default']
  }

  return undefined
}

function parseEventData(struct: AnyStruct, data: string): unknown {
  return decodeSSEEventData(struct, data)
}

function decodeSSEEventData(struct: AnyStruct, data: string): unknown {
  const runtime = struct as unknown as RuntimeStruct
  const definition = runtime[DEFINITION]

  switch (definition.kind) {
    case 'any':
    case 'unknown':
    case 'string':
      return parseStructValue(struct, data)
    case 'number':
      return parseStructValue(struct, parseSSENumber(data))
    case 'boolean':
      return parseStructValue(struct, parseSSEBoolean(data))
    case 'requestBody':
      if (definition.codec === 'json') {
        return parseSSEJsonBody(definition.struct as RuntimeStruct, data)
      }
      if (definition.codec === 'text') {
        return parseStructValue(struct, data)
      }
      throw new TypeError(`SSE event data does not support ${definition.codec} content codec`)
    case 'arrayBuffer':
    case 'blob':
      throw new TypeError(`SSE event data does not support ${definition.kind} content codec`)
    default:
      return parseStructValue(struct, data)
  }
}

function parseSSENumber(data: string): number {
  const trimmed = data.trim()
  if (!trimmed) {
    throw new TypeError('SSE number event data must not be empty')
  }

  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    throw new TypeError('SSE number event data must be finite')
  }

  return value
}

function parseSSEBoolean(data: string): boolean {
  const trimmed = data.trim()
  if (trimmed === 'true') {
    return true
  }
  if (trimmed === 'false') {
    return false
  }
  throw new TypeError('SSE boolean event data must be true or false')
}

function parseSSEJsonBody(struct: RuntimeStruct, data: string): unknown {
  return decodeJson(struct, JSON.parse(data) as unknown)
}

function normalizeOpenInfo(open?: EventStreamOpenInfo): StreamOpenInfo | undefined {
  if (!open) {
    return undefined
  }

  return {
    response: open.response,
    url: open.url,
  }
}

function extractOpenInfo(error: unknown): EventStreamOpenInfo | undefined {
  return getErrorOpenInfo(error)
}

function createEventStreamRuntimeError(cause: unknown, response?: HttpResponse<unknown>): RequestError<unknown> {
  if (response && !response.ok) {
    return {
      code: 'HTTP_STATUS',
      data: undefined,
      kind: 'http',
      message: getHttpErrorMessage(response),
      response,
      status: response.status,
    }
  }

  if (isEventStreamResponseValidationError(cause)) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', cause, response)
  }

  return createTransportError(cause)
}

function isEventStreamResponseValidationError(cause: unknown): boolean {
  return (cause instanceof Error && cause.name === 'StructError') || getEventStreamFatalCode(cause) === 'INVALID_RESPONSE'
}
