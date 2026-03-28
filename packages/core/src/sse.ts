import type { Client } from './client'
import type { HttpContext } from './context'
import { ERR_ABORTED } from './response'
import {
  type AnyCompatibleSchema,
  type CompatibleInputOf,
  type CompatibleOutputOf,
  isCompatibleSchema,
  parseCompatibleSchema,
} from './schema'
import {
  applyRequestInterceptors,
  createDefinitionError,
  createHttpRequest,
  createRequestRuntimeError,
  type EndpointInput,
  mergeAbortSignals,
  type ParsedInput,
  parseEndpointInput,
  type RequestBuildHandler,
  type RequestError,
  resolveClientConfig,
  type SettledResponse,
} from './shared'
import { type EventStreamHandle, type EventStreamMessage, type EventStreamOpenInfo, fetchEventStream } from './transport/sse/event_stream'

export interface UseEventStreamConfig {
  abort?: AbortSignal
  client?: Client
  context?: HttpContext
  fetch?: typeof fetch
  timeout?: number
}

export type EventSchemas = Record<string, AnyCompatibleSchema>

type KnownEventKey<TEvents extends EventSchemas> = Exclude<Extract<keyof TEvents, string>, 'default'>

type KnownEventUnion<TEvents extends EventSchemas> = {
  [K in KnownEventKey<TEvents>]: {
    data: CompatibleOutputOf<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[KnownEventKey<TEvents>]

type DefaultEventUnion<TEvents extends EventSchemas> = 'default' extends keyof TEvents
  ? {
      data: CompatibleOutputOf<TEvents['default']>
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

export interface EventStreamDefinition<
  TInput extends AnyCompatibleSchema | undefined = undefined,
  TEvents extends EventSchemas = EventSchemas,
> {
  build?: RequestBuildHandler<ParsedInput<TInput>>
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
  (config?: UseEventStreamConfig): EventStreamRef<TEvent>
  readonly error?: RequestError<unknown>
  readonly open?: StreamOpenInfo
  readonly status: 'aborted' | 'closed' | 'connecting' | 'error' | 'idle' | 'open'
  close(reason?: unknown): void
}

type IsInputOptional<TInput extends AnyCompatibleSchema | undefined> = [TInput] extends [undefined]
  ? true
  : undefined extends CompatibleInputOf<NonNullable<TInput>>
    ? true
    : false

export type UseEventStreamEndpointFn<TInput extends AnyCompatibleSchema | undefined, TEvents extends EventSchemas> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => EventStreamRef<EventStreamData<TEvents>>
    : (input: EndpointInput<TInput>) => EventStreamRef<EventStreamData<TEvents>>

export interface EventStreamEndpoint<
  TInput extends AnyCompatibleSchema | undefined = undefined,
  TEvents extends EventSchemas = EventSchemas,
> extends EventStreamDefinition<TInput, TEvents> {
  readonly kind: 'event-stream'
  readonly method: string
  readonly use: UseEventStreamEndpointFn<TInput, TEvents>
}

type StreamRefConfig = UseEventStreamConfig & {
  readonly applied: boolean
}

type StreamRefState<TEvent> = {
  error?: RequestError<unknown>
  open?: StreamOpenInfo
  promise?: Promise<StreamAwaitResult<TEvent>>
  status: EventStreamRef<TEvent>['status']
  stream?: EventStreamHandle<TEvent>
}

type StreamStartError = {
  open?: EventStreamOpenInfo
}

export function defineEventStream<TInput extends AnyCompatibleSchema | undefined, TEvents extends EventSchemas>(
  definition: EventStreamDefinition<TInput, TEvents>,
): EventStreamEndpoint<TInput, TEvents> {
  const endpoint = {
    ...definition,
    kind: 'event-stream' as const,
    method: definition.method ?? 'GET',
  } as EventStreamEndpoint<TInput, TEvents>

  Object.defineProperty(endpoint, 'use', {
    enumerable: true,
    value: createUseEventStream(endpoint),
  })

  return endpoint
}

export function createUseEventStream<TInput extends AnyCompatibleSchema | undefined, TEvents extends EventSchemas>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents> {
  return ((input?: EndpointInput<TInput>) =>
    createEventStreamRef(endpoint, input, {
      applied: false,
    })) as UseEventStreamEndpointFn<TInput, TEvents>
}

function createEventStreamRef<TInput extends AnyCompatibleSchema | undefined, TEvents extends EventSchemas>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config: StreamRefConfig,
): EventStreamRef<EventStreamData<TEvents>> {
  const controller = new AbortController()
  const state: StreamRefState<EventStreamData<TEvents>> = {
    status: 'idle',
  }

  const getPromise = (): Promise<StreamAwaitResult<EventStreamData<TEvents>>> => {
    if (!state.promise) {
      state.promise = executeEventStreamEndpoint(endpoint, input, config, controller, state)
    }

    return state.promise
  }

  const applyConfig = ((nextConfig?: UseEventStreamConfig) => {
    if (config.applied) {
      throw new Error('Event stream config can only be applied once')
    }

    return createEventStreamRef(endpoint, input, {
      ...nextConfig,
      applied: true,
    })
  }) as EventStreamRef<EventStreamData<TEvents>>

  Object.defineProperties(applyConfig, {
    error: {
      enumerable: true,
      get() {
        return state.error
      },
    },
    open: {
      enumerable: true,
      get() {
        return state.open
      },
    },
    status: {
      enumerable: true,
      get() {
        return state.status
      },
    },
  })

  applyConfig.close = (reason?: unknown) => {
    controller.abort(reason)
    state.stream?.close(reason)
  }

  applyConfig.then = (onfulfilled, onrejected) => getPromise().then(onfulfilled, onrejected)

  return applyConfig
}

async function executeEventStreamEndpoint<TInput extends AnyCompatibleSchema | undefined, TEvents extends EventSchemas>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config: StreamRefConfig,
  controller: AbortController,
  state: StreamRefState<EventStreamData<TEvents>>,
): Promise<StreamAwaitResult<EventStreamData<TEvents>>> {
  state.status = 'connecting'

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
    state.status = transportError.kind === 'transport' && transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError, undefined, undefined]
  }

  let request
  try {
    request = createHttpRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort], config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      responseType: 'text',
      withCredentials: clientConfig.withCredentials,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    state.status = 'error'
    return [definitionError, undefined, undefined]
  }

  try {
    request = await applyRequestInterceptors(request, clientConfig.interceptors)
    const stream = await fetchEventStream<EventStreamData<TEvents>>(request, {
      fetch: config.fetch ?? clientConfig.sse.fetch,
      async transformMessage(message) {
        return await transformStreamMessage(endpoint.events, message)
      },
    })

    state.stream = stream
    state.open = normalizeOpenInfo(stream.open)
    state.status = 'open'

    void stream.closed.then(closeInfo => {
      switch (closeInfo.code) {
        case 'aborted':
          state.status = 'aborted'
          if (!state.error) {
            state.error = createRequestRuntimeError(closeInfo.cause ?? ERR_ABORTED)
          }
          break
        case 'error':
          state.status = 'error'
          if (!state.error) {
            state.error = createRequestRuntimeError(closeInfo.cause, state.open?.response)
          }
          break
        default:
          state.status = 'closed'
      }
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
      data: await parseCompatibleSchema(eventSchema, rawData),
      event: eventName,
      id: message.id || undefined,
      retry: message.retry,
    } as EventStreamData<TEvents>
  } catch {
    return undefined
  }
}

function resolveEventSchema<TEvents extends EventSchemas>(events: TEvents, eventName: string): AnyCompatibleSchema | undefined {
  const exact = events[eventName]
  if (isCompatibleSchema(exact)) {
    return exact
  }

  const fallback = events['default']
  if (isCompatibleSchema(fallback)) {
    return fallback
  }

  return undefined
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

function extractOpenInfo(error: unknown): StreamStartError['open'] | undefined {
  if (typeof error === 'object' && error !== null && 'open' in error) {
    return (error as StreamStartError).open
  }

  return undefined
}
