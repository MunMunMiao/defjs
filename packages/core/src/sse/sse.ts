import { COMMAND_TYPE, EVENT_STREAM_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { ClientConfig, ClientSSEOptions } from '../client/config'
import type { RequestError } from '../error'
import { createDefinitionError, createHttpStatusError, createTransportError } from '../error'
import type { SSEHandler } from '../interceptor/interceptor'
import { makeChain, resolveSSEInterceptors } from '../interceptor/interceptor'
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
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpResponse } from '../internal/http_response'
import { getHttpErrorMessage } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
import { createBaseTransportRequest } from '../internal/transport_request'
import type { RequestOutputShape } from '../http/request'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { isStruct } from '../struct/guards'
import { parseStructValue } from '../struct/introspection'
import { DEFINITION } from '../struct/symbols'
import type { RuntimeStruct } from '../struct/types'
import type { EventStreamHandle, EventStreamOpenInfo } from './transport/event_stream'
import { fetchEventStream, getErrorOpenInfo, getEventStreamFatalCode } from './transport/event_stream'
import type { EventStreamMessage } from './transport/parser'

/** Map of SSE event names to payload structs. */
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

/** Parsed SSE event payload inferred from an `EventStructs` map. */
export type EventStreamData<TEvents extends EventStructs> = TEvents extends EventStructs
  ? KnownEventUnion<TEvents> | DefaultEventUnion<TEvents>
  : never

interface EventStreamDefinitionBase<TEvents extends EventStructs = EventStructs> {
  events: TEvents
  maxBufferSize: number
  maxQueueSize: number
  method?: string
  operation?: string
  /** Optional non-2xx handshake bodies; fills `error.data` when the open status is declared. */
  output?: RequestOutputShape
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

/** Contract describing an SSE endpoint: path, events, and buffer/queue limits. */
export type EventStreamDefinition<TInput extends AnyStruct | undefined = undefined, TEvents extends EventStructs = EventStructs> =
  | EventStreamDefinitionWithoutBuild<TInput, TEvents>
  | (TInput extends AnyStruct ? EventStreamDefinitionWithBuild<TInput, TEvents> : never)

/** Await-result tuple from opening an SSE stream via `client.execute`. */
export type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: EventStreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: EventStreamOpenInfo | undefined]

/** Executable SSE command produced by an `EventStreamCommandBuilder`. */
export interface EventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventStructs> extends BaseCommand<
  typeof EVENT_STREAM_COMMAND
> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

/** Per-execute options for SSE commands (abort, timeout). */
export type EventStreamExecuteOptions = UseCancellationConfig & { signal?: AbortSignal }

/** Builder function that creates `EventStreamCommand` values from endpoint input. */
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

/**
 * Declare a typed Server-Sent Events command builder.
 *
 * Pass path, event structs, and buffer/queue limits. Call the returned builder
 * with input to get an `EventStreamCommand` for `client.execute`.
 *
 * @param definition - SSE contract (path, events, buffer limits, optional input).
 * @returns A builder that creates `EventStreamCommand` values from input.
 *
 * @example
 * ```ts
 * const useEvents = defineEventStream({
 *   maxBufferSize: 1024,
 *   maxQueueSize: 16,
 *   path: '/events',
 *   events: { message: struct.object({ text: struct.string() }) },
 * })
 * ```
 */
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

/**
 * Open an SSE command against the given client config.
 *
 * Prefer `client.execute(command)` in application code; this is the low-level entry used by the client.
 *
 * @param clientConfig - Resolved client configuration.
 * @param command - SSE command from an `EventStreamCommandBuilder`.
 * @param options - Optional execute options (abort, timeout).
 * @returns Await-result tuple of `[error, stream, open]`.
 */
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
    request = createBaseTransportRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: requestSignal,
      baseEndpoint: clientConfig.endpoint,
      defaultHeaders: clientConfig.headers,
      input: endpoint.input,
      operation: endpoint.operation,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      timeout: cancellation.timeout,
      transport: 'sse',
      withCredentials: clientConfig.withCredentials,
    }).request
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
          handshakeOutput: endpoint.output,
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
    const sseChain = makeChain(sseInterceptors)
    // Type boundary: interceptor chain returns EventStreamHandle<unknown>; runtime message transform narrows it to the endpoint's event types.
    const stream = (await awaitWithSignal(() => sseChain(request, sseHandler), requestSignal)) as EventStreamHandle<
      EventStreamData<TEvents>
    >
    chainSettled = true

    const open = stream.open

    discardOwnedStreams(new Error('SSE interceptor discarded an opened stream'), stream)

    return [null, stream, open]
  } catch (error) {
    chainSettled = true
    discardOwnedStreams(error)

    const openInfo = getErrorOpenInfo(error)
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
  onInvalidEvent: ClientSSEOptions['onInvalidEvent'],
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
      data: await decodeSSEEventData(eventStruct, message.data),
      event: eventName,
      id: message.id || undefined,
      // Type boundary: decodeSSEEventData validates against the resolved event struct; the shape matches EventStreamData<TEvents>.
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
  onInvalidEvent: ClientSSEOptions['onInvalidEvent'],
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

function createEventStreamRuntimeError(cause: unknown, response?: HttpResponse<unknown>): RequestError<unknown> {
  if (response && !response.ok) {
    return createHttpStatusError(response.status, getHttpErrorMessage(response), response, response.body)
  }

  if (isEventStreamResponseValidationError(cause)) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', cause, response)
  }

  return createTransportError(cause)
}

function isEventStreamResponseValidationError(cause: unknown): boolean {
  return (cause instanceof Error && cause.name === 'StructError') || getEventStreamFatalCode(cause) === 'INVALID_RESPONSE'
}
