import type { ExcludeUnion, ExtractUnion, NonNullableValue, OmitKeys } from '../internal/utility_types'
import { resolveClientConfig } from '../client/client'
import type { ClientConfig, WebSocketBeforeConnect, WebSocketHeartbeatOptions } from '../client/config'
import type { Client } from '../client/resolve'
import type { RequestError } from '../error'
import { createDefinitionError, createTransportError, ERR_ABORTED } from '../error'
import type { WebSocketSessionLike } from '../interceptor/interceptor'
import { makeWebSocketInterceptorChain, resolveWebSocketInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals } from '../internal/abort'
import { AsyncQueue } from '../internal/async_queue'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpRequest } from '../internal/http_request'
import type { RequestBuild, RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { createWebSocketBuild, createWebSocketRequest, createWebSocketUrlFromRequest } from './build'
import {
  extractCloseInfo,
  isManualSocketCloseReason,
  resolveAbortTransportError,
  serializeOutgoingWebSocketMessage,
  transformWebSocketMessage,
} from './codec'
import type { HeartbeatRuntime } from './heartbeat'
import { startHeartbeat, stopHeartbeat } from './heartbeat'
import type { SendQueue, WebSocketQueueConfig } from './queue'
import { createSendQueue } from './queue'
import type { WebSocketReconnectConfig } from './reconnect'
import { computeReconnectDelay, normalizeReconnectConfig, shouldReconnect, wait } from './reconnect'

export type WebSocketState = 'aborted' | 'closed' | 'closing' | 'connecting' | 'error' | 'idle' | 'open' | 'reconnecting'

export type SocketSchemas = { [key: string]: AnyStruct }

type KnownSocketKey<TMessages extends SocketSchemas> = ExcludeUnion<ExtractUnion<keyof TMessages, string>, 'default'>

type SimplifySocket<T> = { [K in keyof T]: T[K] } & {}

type NormalizeSocketMessage<TKey extends string, TPayload> = TPayload extends { [key: string]: unknown }
  ? SimplifySocket<{ type: TKey } & TPayload>
  : {
      data: TPayload
      type: TKey
    }

type SocketSendMessage<TKey extends string, TPayload> = TPayload extends { [key: string]: unknown }
  ?
      | SimplifySocket<{ type: TKey } & TPayload>
      | {
          data: TPayload
          type: TKey
        }
  : {
      data: TPayload
      type: TKey
    }

type KnownIncomingSocketUnion<TIncoming extends SocketSchemas> = {
  [K in KnownSocketKey<TIncoming>]: NormalizeSocketMessage<K, Infer<TIncoming[K]>>
}[KnownSocketKey<TIncoming>]

type DefaultIncomingSocketUnion<TIncoming extends SocketSchemas> = 'default' extends keyof TIncoming
  ? NormalizeSocketMessage<string, Infer<TIncoming['default']>>
  : never

export type WebSocketIncomingData<TIncoming extends SocketSchemas> = [
  KnownIncomingSocketUnion<TIncoming> | DefaultIncomingSocketUnion<TIncoming>,
] extends [never]
  ? never
  : KnownIncomingSocketUnion<TIncoming> | DefaultIncomingSocketUnion<TIncoming>

type KnownOutgoingSocketUnion<TOutgoing extends SocketSchemas> = {
  [K in KnownSocketKey<TOutgoing>]: SocketSendMessage<K, EndpointInput<TOutgoing[K]>>
}[KnownSocketKey<TOutgoing>]

export type WebSocketOutgoingData<TOutgoing extends SocketSchemas | undefined> = TOutgoing extends SocketSchemas
  ? [KnownOutgoingSocketUnion<TOutgoing>] extends [never]
    ? never
    : KnownOutgoingSocketUnion<TOutgoing>
  : never

interface WebSocketDefinitionBase<
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
> {
  incoming: TIncoming
  outgoing?: TOutgoing
  path: string
  protocols?: readonly string[]
}

type WebSocketDefinitionWithoutBuild<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
> = WebSocketDefinitionBase<TIncoming, TOutgoing> & {
  build?: never
  input?: TInput
}

type WebSocketDefinitionWithBuild<
  TInput extends AnyStruct,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
> = WebSocketDefinitionBase<TIncoming, TOutgoing> & {
  build: RequestBuildHandler<TInput, 'webSocket'>
  input: TInput
}

export type WebSocketDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
> =
  | WebSocketDefinitionWithoutBuild<TInput, TIncoming, TOutgoing>
  | (TInput extends AnyStruct ? WebSocketDefinitionWithBuild<TInput, TIncoming, TOutgoing> : never)

export interface WebSocketConnectionInfo {
  extensions?: string
  protocol?: string
  url?: string
}

export interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}

export interface WebSocketSession<TIncoming = unknown, TOutgoing = never> {
  readonly connection: WebSocketConnectionInfo
  readonly closed: Promise<WebSocketCloseInfo>
  readonly receive: AsyncIterable<TIncoming>
  readonly state: WebSocketState
  close(code?: number, reason?: string): void
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: WebSocketState) => void): () => void
  send(message: TOutgoing): void
}

export type SocketAwaitResult<TIncoming, TOutgoing = never> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]

interface UseWebSocketBaseConfig<TIncoming = unknown, TOutgoing = unknown> {
  beforeConnect?: WebSocketBeforeConnect
  client?: Client
  heartbeat?: WebSocketHeartbeatConfig<TIncoming, TOutgoing>
  protocols?: readonly string[]
  queue?: WebSocketQueueConfig
  reconnect?: WebSocketReconnectConfig
}

export type UseWebSocketConfig<TIncoming = unknown, TOutgoing = unknown> = UseWebSocketBaseConfig<TIncoming, TOutgoing> &
  UseCancellationConfig

export interface WebSocketRef<TIncoming = unknown, TOutgoing = never> extends PromiseLike<SocketAwaitResult<TIncoming, TOutgoing>> {
  readonly connection?: WebSocketConnectionInfo
  readonly error?: RequestError<unknown>
  readonly status: WebSocketState
  close(code?: number, reason?: string): void
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: WebSocketState) => void): () => void
  with(config: UseWebSocketConfig<TIncoming, TOutgoing>): WebSocketRef<TIncoming, TOutgoing>
}

type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<NonNullableValue<TInput>>
    ? true
    : false

export type UseWebSocketEndpointFn<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => WebSocketRef<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>
    : (input: EndpointInput<TInput>) => WebSocketRef<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>

type WebSocketEndpoint<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
> = WebSocketDefinition<TInput, TIncoming, TOutgoing> & {
  readonly kind: 'web-socket'
}

type SocketRefState<TIncoming, TOutgoing> = {
  connection?: WebSocketConnectionInfo
  error?: RequestError<unknown>
  listeners: {
    runtimeError: Set<(error: unknown) => void>
    stateChange: Set<(state: WebSocketState) => void>
  }
  promise?: Promise<SocketAwaitResult<TIncoming, TOutgoing>>
  socket?: WebSocketSession<TIncoming, TOutgoing>
  status: WebSocketState
}

export type ManualSocketCloseReason = {
  code?: number
  kind: 'manual-web-socket-close'
  reason?: string
}

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

export type { WebSocketQueueConfig, WebSocketReconnectConfig }
export type WebSocketHeartbeatConfig<TIncoming = unknown, TOutgoing = unknown> = OmitKeys<
  WebSocketHeartbeatOptions,
  'isAck' | 'message'
> & {
  isAck?: (message: TIncoming) => boolean
  message?: <T = TOutgoing>() => T | unknown
}

function createTypedWebSocketEndpoint<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>): UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing> {
  return (input: EndpointInput<TInput> | undefined) => createWebSocketRef(endpoint, input)
}

function castParsedWebSocketInput<TInput extends AnyStruct | undefined>(value: unknown): ParsedInput<TInput> {
  // Type boundary: parseEndpointInput validates with endpoint.input before this helper is called.
  return value as ParsedInput<TInput>
}

export function defineWebSocket<
  TInput extends AnyStruct,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinitionWithBuild<TInput, TIncoming, TOutgoing>): UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing>
export function defineWebSocket<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinitionWithoutBuild<TInput, TIncoming, TOutgoing>): UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing>
export function defineWebSocket<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinition<TInput, TIncoming, TOutgoing>): UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing> {
  const endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing> = {
    ...definition,
    kind: 'web-socket' as const,
  }

  return createTypedWebSocketEndpoint(endpoint)
}

function createWebSocketRef<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(
  endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>,
  input: EndpointInput<TInput> | undefined,
  config?: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
): WebSocketRef<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> {
  const controller = new AbortController()
  const state: SocketRefState<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> = {
    listeners: {
      runtimeError: new Set(),
      stateChange: new Set(),
    },
    status: 'idle',
  }

  const getPromise = (): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>> => {
    if (!state.promise) {
      state.promise = executeWebSocketEndpoint(endpoint, input, config, controller, state)
    }

    return state.promise
  }

  return {
    get connection() {
      return state.connection
    },
    get error() {
      return state.error
    },
    get status() {
      return state.status
    },
    close(code?: number, reason?: string) {
      state.socket?.close(code, reason)
      if (!controller.signal.aborted) {
        controller.abort({ code, kind: 'manual-web-socket-close', reason } satisfies ManualSocketCloseReason)
      }
    },
    onRuntimeError(listener) {
      state.listeners.runtimeError.add(listener)
      return () => {
        state.listeners.runtimeError.delete(listener)
      }
    },
    onStateChange(listener) {
      state.listeners.stateChange.add(listener)
      return () => {
        state.listeners.stateChange.delete(listener)
      }
    },
    with(nextConfig) {
      return createWebSocketRef(endpoint, input, nextConfig)
    },
    then(onfulfilled, onrejected) {
      return getPromise().then(onfulfilled, onrejected)
    },
  }
}

async function executeWebSocketEndpoint<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(
  endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>,
  input: EndpointInput<TInput> | undefined,
  config: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> | undefined,
  controller: AbortController,
  state: SocketRefState<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>> {
  setSocketState(state, 'connecting')

  if (hasAbortTimeoutConflict(config)) {
    const definitionError = createAbortTimeoutConflictError()
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = castParsedWebSocketInput<TInput>(await parseEndpointInput(endpoint.input, input))
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  let built: RequestBuild
  try {
    built = createWebSocketBuild(parsedInput, endpoint.build, endpoint.input)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  let clientConfig: ClientConfig
  try {
    clientConfig = resolveClientConfig(config?.client)
  } catch (error) {
    const transportError = createTransportError(error)
    state.error = transportError
    /* istanbul ignore next -- unreachable: resolveClientConfig never throws ERR_ABORTED */
    if (transportError.code === 'ABORTED') {
      setSocketState(state, 'aborted')
    } else {
      setSocketState(state, 'error')
    }
    return [transportError, undefined, undefined]
  }

  const signal = mergeAbortSignals(controller.signal, [config?.abort], config?.timeout)
  const abortedBeforeStart = resolveAbortTransportError(signal)
  if (abortedBeforeStart) {
    state.error = abortedBeforeStart
    /* istanbul ignore next -- unreachable: resolveAbortTransportError always returns ABORTED */
    const nextStatus = abortedBeforeStart.code === 'ABORTED' ? 'aborted' : 'error'
    setSocketState(state, nextStatus)
    return [abortedBeforeStart, undefined, undefined]
  }

  const wsRequest: HttpRequest = createWebSocketRequest({
    abort: signal,
    baseEndpoint: clientConfig.endpoint,
    build: built,
    path: endpoint.path,
    queryParamsSerializer: clientConfig.queryParamsSerializer,
    withCredentials: clientConfig.withCredentials,
  })

  const WebSocketCtor = clientConfig.webSocket.WebSocket ?? globalThis.WebSocket
  /* istanbul ignore next -- defensive: runtime support varies by environment */
  if (typeof WebSocketCtor !== 'function') {
    const transportError = createTransportError(new Error('WebSocket is not supported in current runtime'))
    state.error = transportError
    setSocketState(state, 'error')
    return [transportError, undefined, undefined]
  }

  const wsHandler = async (req: HttpRequest): Promise<WebSocketSessionLike> => {
    return new Promise((resolveSession, rejectSession) => {
      const incomingQueue = new AsyncQueue<WebSocketIncomingData<TIncoming>>()
      const closedDeferred = createDeferred<WebSocketCloseInfo>()
      const sessionController = {
        currentSocket: undefined as WebSocket | undefined,
        heartbeat: undefined as HeartbeatRuntime<WebSocketIncomingData<TIncoming>> | undefined,
        lastRuntimeError: undefined,
      }
      const sendQueue = createSendQueue(config?.queue ?? clientConfig.webSocket.queue)
      const session = createWebSocketSession(
        endpoint.outgoing,
        incomingQueue,
        closedDeferred.promise,
        controller,
        state,
        sessionController,
        sendQueue,
        WebSocketCtor.OPEN,
        // Type boundary: createWebSocketSession is generic over TIncoming/TOutgoing; the cast aligns the locally-typed session with the endpoint's schema types.
      ) as WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>

      let startupSettled = false
      let finished = false
      let latestConnection: WebSocketConnectionInfo | undefined
      let attempt = 0

      const reconnect = normalizeReconnectConfig(config?.reconnect ?? clientConfig.webSocket.reconnect)
      const heartbeatConfig = (config?.heartbeat ?? clientConfig.webSocket.heartbeat) as
        // Type boundary: client config stores the heartbeat as a generic shape; the local type adds incoming/outgoing specificity.
        WebSocketHeartbeatConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> | undefined
      const beforeConnect = config?.beforeConnect ?? clientConfig.webSocket.beforeConnect
      const baseProtocols = [...(config?.protocols ?? clientConfig.webSocket.protocols ?? endpoint.protocols ?? [])]

      void run()

      async function run(): Promise<void> {
        while (!finished) {
          /* istanbul ignore next -- defensive: abort between wait-resume and loop-top is a micro-race */
          if (signal.aborted) {
            finishWithAbort()
            return
          }

          const nextState = attempt === 0 ? 'connecting' : 'reconnecting'
          setSocketState(state, nextState)

          const prepared = await prepareAttempt()
          if (!prepared.ok) {
            finishStartFailure(prepared.error)
            return
          }

          const outcome = await connectOnce(prepared.url, prepared.protocols)
          latestConnection = outcome.connection ?? latestConnection
          state.connection = latestConnection

          /* istanbul ignore next -- defensive: connectOnce never resolves after finishWithAbort/finalizeClosed */
          if (finished) {
            return
          }

          if (signal.aborted) {
            finishWithAbort(outcome.closeInfo)
            return
          }

          const nextAttempt = attempt + 1
          if (reconnect && nextAttempt <= reconnect.attempts && shouldReconnect(reconnect, outcome, nextAttempt)) {
            attempt = nextAttempt
            const delayMs = computeReconnectDelay(reconnect, nextAttempt)
            if (delayMs > 0) {
              try {
                await wait(delayMs, signal)
                // oxlint-disable-next-line eslint/no-unused-vars
              } catch (_) /* istanbul ignore next -- source-map skew: catch body is executed by the reconnect-abort test but mapped to an uncovered line */ {
                finishWithAbort(outcome.closeInfo)
                return
              }
            }
            continue
          }

          if (!startupSettled) {
            /* istanbul ignore next -- unreachable: outcome.cause is always set when !startupSettled */
            finishStartFailure(createTransportError(outcome.cause ?? new Error('WebSocket closed before open')), outcome.connection)
            return
          }

          finalizeClosed(outcome.closeInfo)
          return
        }
      }

      async function prepareAttempt(): Promise<
        { ok: true; protocols: readonly string[]; url: string } | { error: RequestError<unknown>; ok: false }
      > {
        let url: string
        try {
          url = createWebSocketUrlFromRequest(req)
        } catch (error) {
          return {
            error: createDefinitionError('REQUEST_VALIDATION_FAILED', error),
            ok: false,
          }
        }

        if (beforeConnect) {
          try {
            await beforeConnect()
          } catch (error) {
            return {
              error: createTransportError(error),
              ok: false,
            }
          }
        }

        return {
          ok: true,
          protocols: baseProtocols,
          url,
        }
      }

      async function connectOnce(url: string, protocols: readonly string[]): Promise<SocketLifecycleOutcome> {
        let socket: WebSocket
        try {
          socket = protocols.length > 0 ? new WebSocketCtor(url, [...protocols]) : new WebSocketCtor(url)
          /* istanbul ignore next -- defensive: binaryType may not exist on all WebSocket implementations */
          if ('binaryType' in socket) {
            socket.binaryType = 'arraybuffer'
          }
          /* istanbul ignore next -- defensive: WebSocket constructor errors are environment-dependent */
        } catch (error) {
          return {
            closeInfo: {
              cause: error,
              reason: error instanceof Error ? error.message : 'WebSocket connection error',
            },
            connection: undefined,
            cause: error,
            opened: false,
          }
        }

        sessionController.currentSocket = socket
        let opened = false
        let runtimeCause: unknown

        return await new Promise<SocketLifecycleOutcome>((resolveAttempt) => {
          const cleanup = () => {
            stopHeartbeat(sessionController)
            socket.removeEventListener('open', handleOpen)
            socket.removeEventListener('message', onMessage)
            socket.removeEventListener('close', handleClose)
            socket.removeEventListener('error', handleError)
            signal.removeEventListener('abort', handleAbort)
            sessionController.currentSocket = undefined
          }

          const connectionInfo = (): WebSocketConnectionInfo => ({
            extensions: socket.extensions || undefined,
            protocol: socket.protocol || undefined,
            url: socket.url,
          })

          const handleAbort = () => {
            /* istanbul ignore next -- defensive: abort after close event is a micro-race */
            if (socket.readyState !== WebSocketCtor.OPEN && socket.readyState !== WebSocketCtor.CONNECTING) {
              return
            }
            try {
              setSocketState(state, 'closing')
              const closeReason = signal.reason
              /* istanbul ignore if -- unreachable: ref.close()/session.close() close socket before aborting, so handleAbort sees CLOSING state */
              if (isManualSocketCloseReason(closeReason)) {
                socket.close(closeReason.code, closeReason.reason)
              } else {
                socket.close()
              }
            } catch {
              // istanbul ignore next -- defensive: native WebSocket.close() never throws
            }
          }

          const handleOpen = () => {
            opened = true
            latestConnection = connectionInfo()
            state.connection = latestConnection
            setSocketState(state, 'open')
            if (!startupSettled) {
              startupSettled = true
              state.socket = session
              // Type boundary: session is created as WebSocketSession<...> above; resolveSession expects WebSocketSessionLike (structural match).
              resolveSession(session as WebSocketSessionLike)
            }
            flushSendQueue(socket, sendQueue, state, WebSocketCtor.OPEN)
            startHeartbeat(socket, sessionController, heartbeatConfig, endpoint.outgoing, sendQueue, (error) =>
              emitRuntimeError(state, error),
            )
          }

          const handleMessage = async (event: MessageEvent) => {
            let transformed: WebSocketIncomingData<typeof endpoint.incoming> | undefined
            try {
              transformed = await transformWebSocketMessage(endpoint.incoming, event.data)
            } catch (error) {
              // schema validation failure → surface via onRuntimeError instead of silent drop.
              emitRuntimeError(state, error)
              return
            }
            if (typeof transformed === 'undefined') {
              return
            }

            if (sessionController.heartbeat?.isAck?.(transformed)) {
              sessionController.heartbeat.markAck()
              return
            }

            incomingQueue.push(transformed)
          }

          // Wrap async handler in a named sync fn so addEventListener / removeEventListener share the same ref.
          const onMessage = (event: MessageEvent) => {
            void handleMessage(event)
          }

          const handleError = () => {
            runtimeCause = runtimeCause ?? new Error('WebSocket connection error')
            emitRuntimeError(state, runtimeCause)
          }

          const handleClose = async (event: CloseEvent) => {
            cleanup()
            const closeInfo = extractCloseInfo(event, runtimeCause)
            resolveAttempt({
              closeInfo,
              connection: connectionInfo(),
              cause: runtimeCause,
              opened,
            })
          }

          signal.addEventListener('abort', handleAbort, { once: true })
          socket.addEventListener('open', handleOpen)
          socket.addEventListener('message', onMessage)
          socket.addEventListener('close', handleClose)
          socket.addEventListener('error', handleError)
        })
      }

      function finishStartFailure(error: RequestError<unknown>, connection?: WebSocketConnectionInfo): void {
        /* istanbul ignore next -- defensive: never re-entered in practice */
        if (finished) {
          return
        }

        finished = true
        state.connection = connection
        state.error = error
        setSocketState(state, error.kind === 'transport' && error.code === 'ABORTED' ? 'aborted' : 'error')
        closedDeferred.resolve({
          cause: error,
          reason: error.message,
        })
        rejectSession(error)
      }

      function finishWithAbort(closeInfo?: WebSocketCloseInfo): void {
        if (!startupSettled) {
          /* istanbul ignore next -- unreachable: resolveAbortTransportError always returns a value when signal is aborted */
          const transportError = resolveAbortTransportError(signal) ?? createTransportError(ERR_ABORTED)
          finishStartFailure(transportError, latestConnection)
          return
        }

        const abortReason = signal.reason
        if (isManualSocketCloseReason(abortReason)) {
          /* istanbul ignore next -- closeInfo always has code/reason when from connectOnce */
          const closeCode = closeInfo?.code ?? abortReason.code
          /* istanbul ignore next -- closeInfo always has code/reason when from connectOnce */
          const closeReasonText = closeInfo?.reason || abortReason.reason
          finalizeClosed({
            ...closeInfo,
            code: closeCode,
            reason: closeReasonText,
          })
          return
        }

        finalizeClosed(
          /* istanbul ignore next -- closeInfo is always present from connectOnce */
          closeInfo ?? {
            cause: abortReason,
            reason: abortReason instanceof Error ? abortReason.message : undefined,
          },
        )
      }

      function finalizeClosed(closeInfo: WebSocketCloseInfo): void {
        /* istanbul ignore next -- defensive: never re-entered in practice */
        if (finished) {
          return
        }

        finished = true
        if (signal.aborted) {
          const reason = signal.reason
          if (isManualSocketCloseReason(reason)) {
            setSocketState(state, 'closed')
          } else {
            state.error = resolveAbortTransportError(signal)
            const nextState = state.error?.kind === 'transport' && state.error.code === 'ABORTED' ? 'aborted' : 'error'
            setSocketState(state, nextState)
          }
        } else if (closeInfo.cause) {
          // Close driven by a runtime cause(transport/protocol error) should surface as 'error'.
          /* istanbul ignore next -- unreachable: state.error is never set before finalizeClosed */
          if (!state.error) {
            state.error = createTransportError(closeInfo.cause)
          }
          setSocketState(state, 'error')
        } else {
          setSocketState(state, 'closed')
        }

        sendQueue.clear()
        incomingQueue.close()
        closedDeferred.resolve(closeInfo)
      }
    })
  }

  const wsInterceptors = resolveWebSocketInterceptors(clientConfig.interceptors)
  const wsChain = makeWebSocketInterceptorChain(wsInterceptors)

  try {
    const session = await wsChain(wsRequest, wsHandler)
    // Type boundary: interceptor chain returns WebSocketSessionLike; the concrete type matches the endpoint's incoming/outgoing schemas.
    return [null, session as WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>, session.connection]
  } catch (error) {
    // Type boundary: wsChain rejects with RequestError<unknown> per interceptor contract.
    return [error as RequestError<unknown>, undefined, state.connection]
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

export type SocketLifecycleOutcome = {
  closeInfo: WebSocketCloseInfo
  connection?: WebSocketConnectionInfo
  cause?: unknown
  opened: boolean
}

function createWebSocketSession<TIncoming, TOutgoing extends SocketSchemas | undefined>(
  outgoing: TOutgoing,
  queue: AsyncQueue<TIncoming>,
  closed: Promise<WebSocketCloseInfo>,
  controller: AbortController,
  state: SocketRefState<TIncoming, WebSocketOutgoingData<TOutgoing>>,
  sessionController: {
    currentSocket: WebSocket | undefined
    heartbeat: HeartbeatRuntime<TIncoming> | undefined
  },
  sendQueue: SendQueue,
  openState: number,
): WebSocketSession<TIncoming, WebSocketOutgoingData<TOutgoing>> {
  return {
    get connection() {
      /* istanbul ignore next -- unreachable: state.connection is always set before socket is exposed */
      return state.connection ?? {}
    },
    closed,
    close(code?: number, reason?: string) {
      sessionController.currentSocket?.close(code, reason)
      if (!controller.signal.aborted) {
        controller.abort({ code, kind: 'manual-web-socket-close', reason } satisfies ManualSocketCloseReason)
      }
    },
    get state() {
      return state.status
    },
    onRuntimeError(listener) {
      // Type boundary: listener is typed as (error: unknown) => void at the call site; the set stores the same runtime value.
      state.listeners.runtimeError.add(listener as (error: unknown) => void)
      return () => {
        state.listeners.runtimeError.delete(listener as (error: unknown) => void)
      }
    },
    onStateChange(listener) {
      state.listeners.stateChange.add(listener)
      return () => {
        state.listeners.stateChange.delete(listener)
      }
    },
    receive: queue,
    send(message: WebSocketOutgoingData<TOutgoing>) {
      const serialized = serializeOutgoingWebSocketMessage(outgoing, message)
      if (sessionController.currentSocket?.readyState === openState) {
        sessionController.currentSocket.send(serialized)
        return
      }

      sendQueue.enqueue(serialized)
    },
  }
}

function flushSendQueue(socket: WebSocket, queue: SendQueue, state: SocketRefState<unknown, unknown>, openState: number): void {
  while (socket.readyState === openState) {
    const next = queue.shift()
    if (!next) {
      return
    }

    try {
      socket.send(next)
      /* istanbul ignore next -- defensive: send errors are environment-dependent */
    } catch (error) {
      state.error = createTransportError(error)
      emitRuntimeError(state, error)
      return
    }
  }
}

function setSocketState<TIncoming, TOutgoing>(state: SocketRefState<TIncoming, TOutgoing>, next: WebSocketState): void {
  if (state.status === next) {
    return
  }

  state.status = next
  for (const listener of state.listeners.stateChange) {
    listener(next)
  }
}

function emitRuntimeError<TIncoming, TOutgoing>(state: SocketRefState<TIncoming, TOutgoing>, error: unknown): void {
  for (const listener of state.listeners.runtimeError) {
    listener(error)
  }
}
