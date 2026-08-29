import { COMMAND_TYPE, WEB_SOCKET_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { ClientConfig, ClientWebSocketOptions, WebSocketHandle } from '../client/config'

import type { RequestError } from '../error'
import { createDefinitionError, createTransportError, ERR_ABORTED } from '../error'
import type { WebSocketSessionLike } from '../interceptor/interceptor'
import { makeChain, resolveWebSocketInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import {
  awaitWithSignal,
  createAbortTimeoutConflictError,
  hasAbortTimeoutConflict,
  mergeAbortSignals,
  resolveAbortTransportError,
  snapshotCancellationConfig,
  validateTransportTimeout,
} from '../internal/abort'
import { AsyncQueue } from '../internal/async_queue'
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpRequest } from '../internal/http_request'
import type { RequestBuild, RequestBuildHandler } from '../internal/request_builder'
import { buildRequest } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { createWebSocketRequest, createWebSocketUrlFromRequest } from './build'
import { extractCloseInfo, MissingWebSocketStructError, serializeOutgoingWebSocketMessage, transformWebSocketMessage } from './codec'
import type { WebSocketCloseSnapshot } from './codec'
import type { HeartbeatRuntime } from './heartbeat'
import { startHeartbeat, stopHeartbeat, validateHeartbeatConfig } from './heartbeat'
import { computeReconnectDelay, wait } from '../internal/backoff'
import { normalizeReconnectConfig, shouldReconnect } from './reconnect'

/** Lifecycle state of a managed WebSocket session. */
export type WebSocketState = 'aborted' | 'closed' | 'closing' | 'connecting' | 'error' | 'idle' | 'open' | 'reconnecting'

/** Map of WebSocket message type names to payload structs. */
export type SocketStructs = { [key: string]: AnyStruct }

export interface NormalizedWebSocketIncoming {
  data: unknown
  type: string
}

export type NormalizedWebSocketOutgoing = boolean | null | number | string | readonly unknown[] | { readonly [key: string]: unknown }

export type WebSocketIncomingNormalizer = (decoded: unknown) => NormalizedWebSocketIncoming | undefined

export type WebSocketOutgoingNormalizer = (type: string, encodedPayload: unknown) => NormalizedWebSocketOutgoing

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

type KnownIncomingSocketUnion<TIncoming extends SocketStructs> = {
  [K in keyof TIncoming & string as K extends 'default' ? never : K]: NormalizeSocketMessage<K, Infer<TIncoming[K]>>
} extends infer O
  ? O[keyof O]
  : never

type KnownOutgoingSocketUnion<TOutgoing extends SocketStructs> = {
  [K in keyof TOutgoing & string as K extends 'default' ? never : K]: SocketSendMessage<K, EndpointInput<TOutgoing[K]>>
} extends infer O
  ? O[keyof O]
  : never

type DefaultIncomingSocketUnion<TIncoming extends SocketStructs> = 'default' extends keyof TIncoming
  ? NormalizeSocketMessage<string, Infer<TIncoming['default']>>
  : never

/** Incoming message shape inferred from an incoming `SocketStructs` map. */
export type WebSocketIncomingData<TIncoming extends SocketStructs> = [
  KnownIncomingSocketUnion<TIncoming> | DefaultIncomingSocketUnion<TIncoming>,
] extends [never]
  ? never
  : KnownIncomingSocketUnion<TIncoming> | DefaultIncomingSocketUnion<TIncoming>

/** Outgoing message shape inferred from an outgoing `SocketStructs` map. */
export type WebSocketOutgoingData<TOutgoing extends SocketStructs | undefined> = TOutgoing extends SocketStructs
  ? [KnownOutgoingSocketUnion<TOutgoing>] extends [never]
    ? never
    : KnownOutgoingSocketUnion<TOutgoing>
  : never

interface WebSocketDefinitionBase<
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
> {
  incoming: TIncoming
  maxIncomingQueueSize: number
  maxOutgoingQueueSize?: number
  normalizeIncoming?: WebSocketIncomingNormalizer
  normalizeOutgoing?: WebSocketOutgoingNormalizer
  operation?: string
  outgoing?: TOutgoing
  path: string
  protocols?: readonly string[]
}

type WebSocketDefinitionWithoutBuild<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
> = WebSocketDefinitionBase<TIncoming, TOutgoing> & {
  build?: never
  input?: TInput
}

type WebSocketDefinitionWithBuild<
  TInput extends AnyStruct,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
> = WebSocketDefinitionBase<TIncoming, TOutgoing> & {
  build: RequestBuildHandler<TInput, 'webSocket'>
  input: TInput
}

/** Contract describing a WebSocket endpoint: path, message structs, and queue limits. */
export type WebSocketDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
> =
  | WebSocketDefinitionWithoutBuild<TInput, TIncoming, TOutgoing>
  | (TInput extends AnyStruct ? WebSocketDefinitionWithBuild<TInput, TIncoming, TOutgoing> : never)

/** Connection metadata for the current WebSocket generation. */
export interface WebSocketConnectionInfo {
  extensions?: string
  generation: number
  protocol?: string
  url?: string
}

/** How a WebSocket session ended: closed, aborted, or error. */
export type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }

/** Typed WebSocket session: send/receive messages, observe state, and close. */
export interface WebSocketSession<TIncoming = unknown, TOutgoing = never> extends AsyncDisposable {
  readonly bufferedAmount: number
  readonly connection: WebSocketConnectionInfo
  readonly closed: Promise<WebSocketCloseInfo>
  readonly receive: AsyncIterable<TIncoming>
  readonly state: WebSocketState
  close(code?: number, reason?: string): void
  [Symbol.asyncDispose](): PromiseLike<void>
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: WebSocketState) => void): () => void
  send(message: TOutgoing): void
}

/** Await-result tuple from opening a WebSocket via `client.execute`. */
export type SocketAwaitResult<TIncoming, TOutgoing = never> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]

interface UseWebSocketBaseConfig<TIncoming = unknown, TOutgoing = unknown> {
  beforeConnect?: ClientWebSocketOptions['beforeConnect']
  heartbeat?: WebSocketHeartbeatConfig<TIncoming, TOutgoing>
  protocols?: readonly string[]
  reconnect?: ClientWebSocketOptions['reconnect']
}

/** Client configuration for WebSocket execute (heartbeat, reconnect, abort). */
export type UseWebSocketConfig<TIncoming = unknown, TOutgoing = unknown> = UseWebSocketBaseConfig<TIncoming, TOutgoing> &
  UseCancellationConfig

/** Per-execute options for WebSocket commands, including an optional `AbortSignal`. */
export type WebSocketExecuteOptions<TIncoming = unknown, TOutgoing = unknown> = UseWebSocketConfig<TIncoming, TOutgoing> & {
  signal?: AbortSignal
}

/** Executable WebSocket command produced by a `WebSocketCommandBuilder`. */
export interface WebSocketCommand<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketStructs,
  TOutgoing extends SocketStructs | undefined,
> extends BaseCommand<typeof WEB_SOCKET_COMMAND> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}

/** Builder function that creates `WebSocketCommand` values from endpoint input. */
export type WebSocketCommandBuilder<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketStructs,
  TOutgoing extends SocketStructs | undefined,
> = EndpointCommandBuilder<TInput, WebSocketCommand<TInput, TIncoming, TOutgoing>>

type WebSocketEndpoint<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
> = WebSocketDefinition<TInput, TIncoming, TOutgoing>

type SocketRefState = {
  connection?: WebSocketConnectionInfo
  error?: RequestError<unknown>
  listeners: {
    runtimeError: Set<(error: unknown) => void>
    stateChange: Set<(state: WebSocketState) => void>
  }
  status: WebSocketState
  transition: number
}

/** Reason recorded when the session is closed via `session.close()`. */
export type ManualSocketCloseReason = {
  code?: number
  kind: 'manual-web-socket-close'
  reason?: string
}

/** Heartbeat ping/ack configuration for a live WebSocket session. */
export interface WebSocketHeartbeatConfig<TIncoming = unknown, TOutgoing = unknown> {
  intervalMs: number
  isAck?: (message: TIncoming) => boolean
  message?: <T = TOutgoing>() => T | unknown
  timeoutMs?: number
}

function castParsedWebSocketInput<TInput extends AnyStruct | undefined>(value: unknown): ParsedInput<TInput> {
  // Type boundary: parseEndpointInput validates with endpoint.input before this helper is called.
  return value as ParsedInput<TInput>
}

/**
 * Declare a typed WebSocket command builder.
 *
 * Pass path, incoming (and optional outgoing) message structs, and queue limits.
 * Call the returned builder with input to get a `WebSocketCommand` for `client.execute`.
 *
 * @param definition - WebSocket contract (path, structs, queue limits, optional input).
 * @returns A builder that creates `WebSocketCommand` values from input.
 *
 * @example
 * ```ts
 * const useChat = defineWebSocket({
 *   maxIncomingQueueSize: 16,
 *   path: '/ws/chat',
 *   incoming: { message: struct.object({ text: struct.string() }) },
 *   outgoing: { message: struct.object({ text: struct.string() }) },
 * })
 * ```
 */
export function defineWebSocket<
  TInput extends AnyStruct,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
>(definition: WebSocketDefinitionWithBuild<TInput, TIncoming, TOutgoing>): WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
export function defineWebSocket<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
>(definition: WebSocketDefinitionWithoutBuild<TInput, TIncoming, TOutgoing>): WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
export function defineWebSocket<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketStructs = SocketStructs,
  TOutgoing extends SocketStructs | undefined = undefined,
>(definition: WebSocketDefinition<TInput, TIncoming, TOutgoing>): WebSocketCommandBuilder<TInput, TIncoming, TOutgoing> {
  const endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing> = {
    ...definition,
  }

  function create(input?: EndpointInput<TInput>): WebSocketCommand<TInput, TIncoming, TOutgoing> {
    const command: WebSocketCommand<TInput, TIncoming, TOutgoing> = {
      [COMMAND_TYPE]: WEB_SOCKET_COMMAND,
      endpoint,
      input,
    }

    return command
  }

  return ((input?: EndpointInput<TInput>) => create(input)) as WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
}

async function runWebSocketCommand<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketStructs,
  TOutgoing extends SocketStructs | undefined,
>(
  clientConfig: ClientConfig,
  endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>,
  input: EndpointInput<TInput> | undefined,
  config: WebSocketExecuteOptions<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  controller: AbortController,
  state: SocketRefState,
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>> {
  setSocketState(state, 'connecting')

  let cancellationConfig: ReturnType<typeof snapshotCancellationConfig>
  try {
    cancellationConfig = snapshotCancellationConfig(config)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  if (hasAbortTimeoutConflict(cancellationConfig)) {
    const definitionError = createAbortTimeoutConflictError()
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  try {
    validateTransportTimeout(cancellationConfig.timeout)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  try {
    validateWebSocketQueueLimits(endpoint.maxIncomingQueueSize, endpoint.maxOutgoingQueueSize)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  let beforeConnectOption: ClientWebSocketOptions['beforeConnect']
  let protocolsOption: readonly string[] | undefined
  let reconnect: ReturnType<typeof normalizeReconnectConfig>
  let heartbeatConfig: WebSocketHeartbeatConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> | undefined
  try {
    beforeConnectOption = config.beforeConnect
    const configuredProtocols = config.protocols
    protocolsOption = configuredProtocols ? [...configuredProtocols] : undefined
    const reconnectOption = config.reconnect ?? clientConfig.webSocket.reconnect
    const heartbeatOption = (config.heartbeat ?? clientConfig.webSocket.heartbeat) as
      // Type boundary: client config stores the heartbeat as a generic shape; the local type adds incoming/outgoing specificity.
      WebSocketHeartbeatConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> | undefined
    heartbeatConfig = heartbeatOption
      ? {
          intervalMs: heartbeatOption.intervalMs,
          isAck: heartbeatOption.isAck,
          message: heartbeatOption.message,
          timeoutMs: heartbeatOption.timeoutMs,
        }
      : undefined
    validateHeartbeatConfig(heartbeatConfig)
    reconnect = normalizeReconnectConfig(reconnectOption)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
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
    built = buildRequest(parsedInput, endpoint.build, {
      input: endpoint.input,
      transport: 'webSocket',
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  const chainController = new AbortController()
  const chainSignal = mergeAbortSignals(
    chainController.signal,
    [cancellationConfig.abort, cancellationConfig.signal],
    cancellationConfig.timeout,
  )
  const signal = mergeAbortSignals(controller.signal, [chainSignal])
  const abortedBeforeStart = resolveAbortTransportError(signal)
  if (abortedBeforeStart) {
    state.error = abortedBeforeStart
    const nextStatus = abortedBeforeStart.code === 'ABORTED' ? 'aborted' : 'error'
    setSocketState(state, nextStatus)
    return [abortedBeforeStart, undefined, undefined]
  }

  const wsRequest: HttpRequest = createWebSocketRequest({
    abort: signal,
    baseEndpoint: clientConfig.endpoint,
    build: built,
    operation: endpoint.operation,
    path: endpoint.path,
    queryParamsSerializer: clientConfig.queryParamsSerializer,
    withCredentials: clientConfig.withCredentials,
  })

  const WebSocketCtor = clientConfig.webSocket.handle ?? globalThis.WebSocket
  if (typeof WebSocketCtor !== 'function') {
    const transportError = createTransportError(new Error('WebSocket is not supported in current runtime'))
    state.error = transportError
    setSocketState(state, 'error')
    return [transportError, undefined, undefined]
  }
  const WebSocketImpl = WebSocketCtor as unknown as new (url: string | URL, protocols?: string | string[]) => WebSocketHandle

  let startupConnection: WebSocketConnectionInfo | undefined
  const undeliveredSessions = new Set<WebSocketSessionLike>()
  const pendingSessions = new Set<Promise<WebSocketSessionLike>>()
  let wsHandlerInvoked = false
  let chainSettled = false
  const wsHandler = (req: HttpRequest): Promise<WebSocketSessionLike> => {
    if (chainSettled || wsHandlerInvoked) {
      const rejection = Promise.reject(
        new Error(
          chainSettled
            ? 'WebSocket interceptor next() may not be called after the chain settles'
            : 'WebSocket interceptor next() may only be called once',
        ),
      )
      void rejection.catch(() => undefined)
      return rejection
    }
    wsHandlerInvoked = true
    const pendingSession = new Promise<WebSocketSessionLike>((resolveSession, rejectSession) => {
      const incomingQueue = new AsyncQueue<WebSocketIncomingData<TIncoming>>({
        maxSize: endpoint.maxIncomingQueueSize,
      })
      const closedDeferred = Promise.withResolvers<WebSocketCloseInfo>()
      const sessionController = {
        currentSocket: undefined as WebSocketHandle | undefined,
        heartbeat: undefined as HeartbeatRuntime<WebSocketIncomingData<TIncoming>> | undefined,
      }
      const sendQueue: string[] = []
      let startupSettled = false
      let finished = false
      let latestConnection: WebSocketConnectionInfo | undefined
      let attempt = 0
      let generation = 0
      let activeAttempt: ActiveSocketAttempt | undefined
      let manualClose: ManualSocketCloseReason | undefined
      const messagePumpTasks = new Set<Promise<void>>()
      let disposeTask: Promise<void> | undefined
      let disposeTimer: ReturnType<typeof setTimeout> | undefined
      let disposeTimeout: DOMException | undefined
      let hasCloseError = false
      let closeError: unknown
      let physicalCleanupDetach: (() => void) | undefined

      const hasReconnectPredicate = reconnect?.hasShouldReconnect ?? false
      const beforeConnect = (beforeConnectOption ?? clientConfig.webSocket.beforeConnect) as
        | ((context: { attempt: number; signal: AbortSignal }) => Promise<void> | void)
        | undefined
      const baseProtocols = [...(protocolsOption ?? clientConfig.webSocket.protocols ?? endpoint.protocols ?? [])]
      const session = createWebSocketSession(
        endpoint.outgoing,
        endpoint.normalizeOutgoing,
        incomingQueue,
        closedDeferred.promise,
        state,
        sessionController,
        sendQueue,
        endpoint.maxOutgoingQueueSize ?? 0,
        WebSocketCtor.OPEN,
        () => finished || signal.aborted,
        requestClose,
        disposeSession,
        // Type boundary: createWebSocketSession is generic over TIncoming/TOutgoing; the cast aligns the locally-typed session with the endpoint's struct types.
      ) as WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>

      const lifecycleTask = run().catch((cause) => {
        finish({ cause, kind: 'error' })
      })

      async function run(): Promise<void> {
        while (!finished) {
          if (signal.aborted) {
            finishFromSignal()
            return
          }

          const nextState = attempt === 0 ? 'connecting' : 'reconnecting'
          setSocketState(state, nextState)

          const prepared = await prepareAttempt()
          if (finished) {
            return
          }
          if (!prepared.ok) {
            if (prepared.aborted) {
              finishFromSignal()
            } else {
              finish({ cause: prepared.error, kind: 'error' }, { startupError: prepared.error })
            }
            return
          }
          if (signal.aborted) {
            finishFromSignal()
            return
          }

          const outcome = await connectOnce(prepared.url, prepared.protocols)
          if (finished) {
            return
          }

          if (!startupSettled && outcome.connection) {
            latestConnection = outcome.connection
            state.connection = latestConnection
          }

          if (signal.aborted) {
            finishFromSignal(outcome.closeInfo)
            return
          }

          if (manualClose) {
            finish(toClosedInfo(outcome.closeInfo, manualClose))
            return
          }

          const nextAttempt = attempt + 1
          let reconnectRequested = false
          let reconnectPredicateDeclined = false
          if (reconnect && nextAttempt <= reconnect.attempts) {
            try {
              reconnectRequested = shouldReconnect(reconnect, outcome, nextAttempt)
              reconnectPredicateDeclined = hasReconnectPredicate && !reconnectRequested
            } catch (cause) {
              if (finished) {
                return
              }
              if (signal.aborted) {
                finishFromSignal(outcome.closeInfo)
              } else {
                finish(toErrorInfo(outcome.closeInfo, cause))
              }
              return
            }
          }
          if (finished) {
            return
          }
          if (signal.aborted) {
            finishFromSignal(outcome.closeInfo)
            return
          }

          if (reconnectRequested && reconnect) {
            attempt = nextAttempt
            setSocketState(state, 'reconnecting')
            if (finished) {
              return
            }
            if (signal.aborted) {
              finishFromSignal(outcome.closeInfo)
              return
            }
            const delayMs = computeReconnectDelay(reconnect, nextAttempt)
            if (delayMs > 0) {
              try {
                await wait(delayMs, signal)
              } catch {
                if (!finished) {
                  finishFromSignal(outcome.closeInfo)
                }
                return
              }
            }
            continue
          }

          if (!startupSettled) {
            const cause = outcome.cause ?? new Error('WebSocket closed before open')
            const startupError = createTransportError(cause)
            finish(toErrorInfo(outcome.closeInfo, cause), { startupError })
            return
          }

          if (reconnectPredicateDeclined) {
            finish(toClosedInfo(outcome.closeInfo))
            return
          }

          if (typeof outcome.cause === 'undefined') {
            finish(toClosedInfo(outcome.closeInfo))
          } else {
            finish(toErrorInfo(outcome.closeInfo, outcome.cause))
          }
          return
        }
      }

      async function prepareAttempt(): Promise<
        | { aborted: false; error: RequestError<unknown>; ok: false }
        | { aborted: true; ok: false }
        | { ok: true; protocols: readonly string[]; url: string }
      > {
        let url: string
        try {
          url = createWebSocketUrlFromRequest(req)
        } catch (error) {
          return {
            aborted: false,
            error: createDefinitionError('REQUEST_VALIDATION_FAILED', error),
            ok: false,
          }
        }

        if (beforeConnect) {
          try {
            await awaitWithSignal(() => beforeConnect({ attempt, signal }), signal)
            signal.throwIfAborted()
          } catch (error) {
            if (signal.aborted) {
              return { aborted: true, ok: false }
            }
            return {
              aborted: false,
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
        let socket: WebSocketHandle
        try {
          socket = protocols.length > 0 ? new WebSocketImpl(url, [...protocols]) : new WebSocketImpl(url)
          /* istanbul ignore else -- @preserve defensive: binaryType may not exist on injected nonstandard WebSocket handles */
          if ('binaryType' in socket) {
            socket.binaryType = 'arraybuffer'
          }
        } catch (error) {
          return {
            closeInfo: { cause: error, reason: error instanceof Error ? error.message : 'WebSocket connection error' },
            connection: undefined,
            cause: error,
            opened: false,
          }
        }

        sessionController.currentSocket = socket
        let opened = false
        let runtimeCause: unknown

        return await new Promise<SocketLifecycleOutcome>((resolveAttempt) => {
          let closeOutcome: SocketLifecycleOutcome | undefined
          let closeObserved = false
          let errorCloseTimer: ReturnType<typeof setTimeout> | undefined
          let messagePumpRunning = false
          const messageController = new AbortController()
          const messageSignal = AbortSignal.any([signal, messageController.signal])
          const rawMessages: MessageEvent[] = []
          let settled = false

          const clearErrorCloseTimer = () => {
            if (typeof errorCloseTimer === 'undefined') {
              return
            }
            clearTimeout(errorCloseTimer)
            errorCloseTimer = undefined
          }

          const cleanup = (keepCurrentSocket: boolean) => {
            clearErrorCloseTimer()
            stopHeartbeat(sessionController)
            messageController.abort()
            rawMessages.length = 0
            socket.removeEventListener('open', handleOpen)
            socket.removeEventListener('message', onMessage)
            socket.removeEventListener('close', handleClose)
            socket.removeEventListener('error', handleError)
            signal.removeEventListener('abort', handleAbort)
            if (!keepCurrentSocket && sessionController.currentSocket === socket) {
              sessionController.currentSocket = undefined
            }
          }

          const connectionInfo = (): WebSocketConnectionInfo => ({
            extensions: socket.extensions || undefined,
            generation,
            protocol: socket.protocol || undefined,
            url: socket.url,
          })

          const settleAttempt = (outcome: SocketLifecycleOutcome, keepCurrentSocket = false) => {
            /* istanbul ignore if -- @preserve defensive: every physical attempt is settled through this once-only gate */
            if (settled) {
              return
            }
            settled = true
            cleanup(keepCurrentSocket)
            /* istanbul ignore else -- @preserve invariant: activeAttempt refers to the sole physical socket until settlement */
            if (activeAttempt?.socket === socket) {
              activeAttempt = undefined
            }
            resolveAttempt(outcome)
          }

          const handleAbort = () => {
            if (finished) {
              return
            }
            if (!startupSettled) {
              latestConnection = connectionInfo()
              state.connection = latestConnection
            }
            finishFromSignal(extractCloseInfo(undefined, signal.reason))
          }

          const handleOpen = () => {
            if (finished || opened) {
              return
            }
            opened = true
            generation += 1
            latestConnection = connectionInfo()
            state.connection = latestConnection
            try {
              flushSendQueue(socket, sendQueue, WebSocketCtor.OPEN)
            } catch (cause) {
              finish({ cause, kind: 'error' })
              return
            }
            if (finished || manualClose) {
              return
            }
            setSocketState(state, 'open')
            if (finished) {
              return
            }
            if (!startupSettled) {
              startupConnection = latestConnection
              startupSettled = true
              // Type boundary: session is created as WebSocketSession<...> above; resolveSession expects WebSocketSessionLike (structural match).
              resolveSession(session as WebSocketSessionLike)
            }
            if (state.status === 'open') {
              startHeartbeat(
                socket,
                sessionController,
                heartbeatConfig,
                endpoint.outgoing,
                (cause) => {
                  finish({ cause, kind: 'error' })
                },
                WebSocketCtor.OPEN,
                endpoint.normalizeOutgoing,
              )
            }
          }

          const handleMessage = async (event: MessageEvent) => {
            /* istanbul ignore if -- @preserve defensive: stale physical listeners are removed before logical settlement */
            if (finished || sessionController.currentSocket !== socket) {
              return
            }
            let transformed: WebSocketIncomingData<TIncoming> | undefined
            try {
              transformed = await awaitWithSignal(
                () => transformWebSocketMessage(endpoint.incoming, event.data, endpoint.normalizeIncoming),
                messageSignal,
              )
            } catch (error) {
              if (finished || messageController.signal.aborted) {
                return
              }
              if (error instanceof MissingWebSocketStructError) {
                await notifyWebSocketInvalidEvent(
                  clientConfig.webSocket.onInvalidEvent,
                  {
                    reason: 'missing-struct',
                    message: { type: error.type, data: error.decoded },
                  },
                  messageSignal,
                )
                return
              }
              emitRuntimeError(state, error)
              return
            }
            if (finished || sessionController.currentSocket !== socket || typeof transformed === 'undefined') {
              return
            }

            try {
              const heartbeat = sessionController.heartbeat
              const isAck = heartbeat?.isAck?.(transformed) ?? false
              if (finished || sessionController.currentSocket !== socket || sessionController.heartbeat !== heartbeat) {
                return
              }
              if (isAck && heartbeat) {
                heartbeat.markAck()
                return
              }
              incomingQueue.push(transformed)
            } catch (cause) {
              if (!finished) {
                finish({ cause, kind: 'error' })
              }
            }
          }

          const pumpMessages = async () => {
            if (messagePumpRunning) {
              return
            }
            messagePumpRunning = true
            try {
              while (!finished && rawMessages.length > 0) {
                const event = rawMessages.shift() as MessageEvent
                await handleMessage(event)
              }
              if (!finished && closeOutcome && rawMessages.length === 0) {
                settleAttempt(closeOutcome)
              }
            } catch (cause) {
              /* istanbul ignore next -- @preserve defensive: handleMessage and settleAttempt contain their own failure boundaries */
              finish({ cause, kind: 'error' })
            } finally {
              messagePumpRunning = false
              if (finished) {
                rawMessages.length = 0
              }
            }
          }

          const onMessage = (event: MessageEvent) => {
            /* istanbul ignore if -- @preserve defensive: physical message listeners are removed as soon as close is observed */
            if (finished || closeObserved || sessionController.currentSocket !== socket) {
              return
            }
            if (rawMessages.length >= endpoint.maxIncomingQueueSize) {
              finish({ cause: new Error('WebSocket raw message queue overflow'), kind: 'error' })
              return
            }
            rawMessages.push(event)
            const messagePumpTask = pumpMessages()
            messagePumpTasks.add(messagePumpTask)
            void messagePumpTask.finally(() => {
              messagePumpTasks.delete(messagePumpTask)
            })
          }

          const handleError = () => {
            runtimeCause = runtimeCause ?? new Error('WebSocket connection error')
            stopHeartbeat(sessionController)
            socket.removeEventListener('error', handleError)
            errorCloseTimer = setTimeout(() => {
              errorCloseTimer = undefined
              finish({ cause: runtimeCause, kind: 'error' }, { skipNativeClose: true })
            }, SOCKET_CLOSE_GRACE_MS)
            try {
              socket.close()
            } catch {
              clearErrorCloseTimer()
              finish({ cause: runtimeCause, kind: 'error' }, { skipNativeClose: true })
            }
          }

          const handleClose = (event: CloseEvent) => {
            if (closeObserved) {
              return
            }
            closeObserved = true
            clearErrorCloseTimer()
            sessionController.heartbeat?.stop()
            socket.removeEventListener('open', handleOpen)
            socket.removeEventListener('message', onMessage)
            socket.removeEventListener('error', handleError)
            closeOutcome = {
              closeInfo: extractCloseInfo(event, runtimeCause),
              connection: connectionInfo(),
              cause: runtimeCause,
              opened,
            }
            if (disposeTask) {
              activeAttempt?.abortMessagePumpForDisposal()
            }
            if (typeof runtimeCause !== 'undefined') {
              rawMessages.length = 0
              settleAttempt(closeOutcome)
              return
            }
            if (!messagePumpRunning && rawMessages.length === 0) {
              settleAttempt(closeOutcome)
            }
          }

          activeAttempt = {
            abortMessagePumpForDisposal() {
              if (closeObserved) {
                messageController.abort()
              }
            },
            cancel(keepCurrentSocket = false) {
              settleAttempt(
                {
                  closeInfo: extractCloseInfo(undefined, runtimeCause),
                  connection: connectionInfo(),
                  cause: runtimeCause,
                  opened,
                },
                keepCurrentSocket,
              )
            },
            socket,
          }

          signal.addEventListener('abort', handleAbort, { once: true })
          socket.addEventListener('open', handleOpen)
          socket.addEventListener('message', onMessage)
          socket.addEventListener('close', handleClose)
          socket.addEventListener('error', handleError)
          if (signal.aborted) {
            handleAbort()
          }
        })
      }

      function finish(final: WebSocketCloseInfo, options: FinishOptions = {}): void {
        /* istanbul ignore if -- @preserve defensive once-only gate: terminal callers and reentrant state transitions check finished before invoking finish */
        if (finished) {
          return
        }

        finished = true
        stopHeartbeat(sessionController)

        const activeSocket = sessionController.currentSocket
        if (final.kind !== 'closed' && activeSocket && !options.skipNativeClose) {
          requestNativeCloseBestEffort(activeSocket)
        }
        if (activeSocket && options.keepPhysicalCleanup) {
          physicalCleanupDetach = installPhysicalCleanup(activeSocket, sessionController)
        }
        activeAttempt?.cancel(options.keepPhysicalCleanup)

        sendQueue.length = 0
        if (final.kind === 'closed') {
          incomingQueue.close()
          state.error = undefined
        } else {
          const terminalCause = final.cause ?? new DOMException('Aborted', 'AbortError')
          incomingQueue.fail(terminalCause)
          state.error = options.startupError ?? requestErrorFromCloseInfo(final)
          if (final.kind === 'error') {
            emitRuntimeError(state, final.cause)
          }
        }

        state.connection = latestConnection
        setSocketState(state, final.kind === 'closed' ? 'closed' : final.kind)
        state.listeners.runtimeError.clear()
        state.listeners.stateChange.clear()

        if (!controller.signal.aborted) {
          controller.abort(final)
        }

        closedDeferred.resolve(final)
        if (!startupSettled) {
          const startupError = options.startupError ?? requestErrorFromCloseInfo(final)
          state.error = startupError
          rejectSession(startupError)
        }
      }

      function finishFromSignal(snapshot: WebSocketCloseSnapshot = {}): void {
        /* istanbul ignore next -- @preserve invariant: finishFromSignal is called only after the merged signal aborts */
        const transportError = resolveAbortTransportError(signal) ?? createTransportError(ERR_ABORTED)
        if (transportError.code === 'TIMEOUT') {
          finish(toErrorInfo(snapshot, signal.reason), { startupError: transportError })
          return
        }
        finish(toAbortedInfo(snapshot, signal.reason), { startupError: transportError })
      }

      function requestClose(code?: number, reason?: string): void {
        validateWebSocketClose(code, reason)
        if (finished || manualClose) {
          return
        }

        manualClose = { code, kind: 'manual-web-socket-close', reason }
        sessionController.heartbeat?.stop()
        setSocketState(state, 'closing')
        if (finished) {
          return
        }
        const socket = sessionController.currentSocket
        if (!socket) {
          finish(toClosedInfo({}, manualClose))
          return
        }

        try {
          socket.close(code, reason)
        } catch (cause) {
          try {
            socket.close()
          } catch {
            finish({ cause, kind: 'error' }, { keepPhysicalCleanup: true, skipNativeClose: true })
          }
          throw cause
        }
      }

      function disposeSession(): Promise<void> {
        return (disposeTask ??= Promise.resolve().then(disposeOnce))
      }

      async function disposeOnce(): Promise<void> {
        try {
          try {
            session.close()
          } catch (cause) {
            hasCloseError = true
            closeError = cause
          }
          activeAttempt?.abortMessagePumpForDisposal()

          if (!finished) {
            disposeTimer = setTimeout(() => {
              /* istanbul ignore if -- @preserve defensive: lifecycle completion clears this timer before a later timer task can run */
              if (finished) {
                return
              }
              disposeTimeout = new DOMException('WebSocket close event was not observed before teardown timeout', 'TimeoutError')
              finish(toClosedInfo({}, manualClose), { skipNativeClose: true })
            }, SOCKET_CLOSE_GRACE_MS)
          }

          await lifecycleTask
          await Promise.allSettled([...messagePumpTasks])
        } finally {
          clearTimeout(disposeTimer)
          disposeTimer = undefined
          physicalCleanupDetach?.()
        }

        if (hasCloseError) {
          throw closeError
        }
        if (disposeTimeout) {
          throw disposeTimeout
        }
      }
    })
    pendingSessions.add(pendingSession)
    void pendingSession.then(
      (createdSession) => {
        pendingSessions.delete(pendingSession)
        undeliveredSessions.add(createdSession)
      },
      () => {
        pendingSessions.delete(pendingSession)
      },
    )
    return pendingSession
  }

  const wsInterceptors = resolveWebSocketInterceptors(clientConfig.interceptors)
  const wsChain = makeChain(wsInterceptors)

  try {
    const session = await awaitWithSignal(() => wsChain(wsRequest, wsHandler), chainSignal)
    chainSettled = true
    let deliveredSession = [...undeliveredSessions].some(
      (createdSession) => createdSession === session || createdSession.closed === session.closed,
    )
    const pendingSessionSnapshot = [...pendingSessions]
    if (!deliveredSession && (undeliveredSessions.size > 0 || pendingSessionSnapshot.length > 0) && !controller.signal.aborted) {
      controller.abort(new Error('WebSocket session was replaced by interceptor'))
    }
    await Promise.allSettled(pendingSessionSnapshot)
    deliveredSession = [...undeliveredSessions].some(
      (createdSession) => createdSession === session || createdSession.closed === session.closed,
    )
    const discardedSessions = [...undeliveredSessions].filter(
      (createdSession) => createdSession !== session && createdSession.closed !== session.closed,
    )
    await Promise.allSettled(discardedSessions.map((discardedSession) => discardedSession.closed))
    pendingSessions.clear()
    undeliveredSessions.clear()
    if (!deliveredSession) {
      startupConnection = undefined
    }
    // Type boundary: interceptor chain returns WebSocketSessionLike; the concrete type matches the endpoint's incoming/outgoing structs.
    const typedSession = session as WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>
    return [null, typedSession, startupConnection ?? typedSession.connection]
  } catch (error) {
    chainSettled = true
    const signalError = resolveAbortTransportError(chainSignal)
    const requestError = signalError ?? (error as RequestError<unknown>)
    if (signalError) {
      state.error = signalError
      setSocketState(state, signalError.code === 'ABORTED' ? 'aborted' : 'error')
    }
    const pendingSessionSnapshot = [...pendingSessions]
    if (undeliveredSessions.size > 0 || pendingSessionSnapshot.length > 0) {
      if (!controller.signal.aborted) {
        controller.abort(error)
      }
      await Promise.allSettled(pendingSessionSnapshot)
      await Promise.allSettled([...undeliveredSessions].map((session) => session.closed))
      pendingSessions.clear()
      undeliveredSessions.clear()
    }
    // Type boundary: non-cancellation interceptor errors cross the public RequestError boundary unchanged.
    return [requestError, undefined, state.connection]
  }
}

/**
 * Open a WebSocket command against the given client config.
 *
 * Prefer `client.execute(command)` in application code; this is the low-level entry used by the client.
 *
 * @param clientConfig - Resolved client configuration.
 * @param command - WebSocket command from a `WebSocketCommandBuilder`.
 * @param options - Optional execute options (heartbeat, reconnect, abort).
 * @returns Await-result tuple of `[error, socket, connection]`.
 */
export async function executeWebSocketCommand<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketStructs,
  TOutgoing extends SocketStructs | undefined,
>(
  clientConfig: ClientConfig,
  command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
  options?: WebSocketExecuteOptions<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>> {
  const { endpoint, input } = command
  const config = options ?? {}
  const controller = new AbortController()
  const state: SocketRefState = {
    listeners: {
      runtimeError: new Set(),
      stateChange: new Set(),
    },
    status: 'idle',
    transition: 0,
  }
  return runWebSocketCommand(clientConfig, endpoint, input, config, controller, state)
}

/** Outcome of a single WebSocket connect attempt used by reconnect logic. */
export type SocketLifecycleOutcome = {
  closeInfo: WebSocketCloseSnapshot
  connection?: WebSocketConnectionInfo
  cause?: unknown
  opened: boolean
}

type ActiveSocketAttempt = {
  abortMessagePumpForDisposal(): void
  cancel(keepCurrentSocket?: boolean): void
  socket: WebSocketHandle
}

type FinishOptions = {
  keepPhysicalCleanup?: boolean
  skipNativeClose?: boolean
  startupError?: RequestError<unknown>
}

const SOCKET_CLOSE_GRACE_MS = 1_000
const noop = () => undefined

function createWebSocketSession<TIncoming, TOutgoing extends SocketStructs | undefined>(
  outgoing: TOutgoing,
  normalizeOutgoing: WebSocketOutgoingNormalizer | undefined,
  queue: AsyncQueue<TIncoming>,
  closed: Promise<WebSocketCloseInfo>,
  state: SocketRefState,
  sessionController: {
    currentSocket: WebSocketHandle | undefined
    heartbeat: HeartbeatRuntime<TIncoming> | undefined
  },
  sendQueue: string[],
  maxOutgoingQueueSize: number,
  openState: number,
  isUnavailable: () => boolean,
  requestClose: (code?: number, reason?: string) => void,
  disposeSession: () => PromiseLike<void>,
): WebSocketSession<TIncoming, WebSocketOutgoingData<TOutgoing>> {
  return {
    get bufferedAmount() {
      return sessionController.currentSocket?.bufferedAmount ?? 0
    },
    get connection() {
      return (
        state.connection ??
          /* istanbul ignore next -- @preserve invariant: concrete sessions are delivered only after their first open snapshot */
          { generation: 0 }
      )
    },
    closed,
    close(code?: number, reason?: string) {
      requestClose(code, reason)
    },
    [Symbol.asyncDispose]() {
      return disposeSession()
    },
    get state() {
      return state.status
    },
    onRuntimeError(listener) {
      if (isUnavailable()) {
        return noop
      }
      // Type boundary: listener is typed as (error: unknown) => void at the call site; the set stores the same runtime value.
      state.listeners.runtimeError.add(listener as (error: unknown) => void)
      return () => {
        state.listeners.runtimeError.delete(listener as (error: unknown) => void)
      }
    },
    onStateChange(listener) {
      if (isUnavailable()) {
        return noop
      }
      state.listeners.stateChange.add(listener)
      return () => {
        state.listeners.stateChange.delete(listener)
      }
    },
    receive: queue,
    send(message: WebSocketOutgoingData<TOutgoing>) {
      if (isUnavailable()) {
        throw new DOMException('WebSocket session is closed', 'InvalidStateError')
      }
      const socket = sessionController.currentSocket
      const initialState = state.status
      const initialReadyState = socket?.readyState
      const destination =
        initialState === 'open' && initialReadyState === openState ? 'socket' : initialState === 'reconnecting' ? 'queue' : undefined
      if (!destination) {
        throw new DOMException('WebSocket session is not writable', 'InvalidStateError')
      }

      const serialized = serializeOutgoingWebSocketMessage(outgoing, message, normalizeOutgoing)
      if (
        isUnavailable() ||
        state.status !== initialState ||
        sessionController.currentSocket !== socket ||
        socket?.readyState !== initialReadyState
      ) {
        throw new DOMException('WebSocket session is not writable', 'InvalidStateError')
      }

      if (destination === 'socket') {
        // Type boundary: destination is "socket" only when the captured socket readyState equals the numeric open state.
        const openSocket = socket as WebSocketHandle
        openSocket.send(serialized)
        return
      }
      if (maxOutgoingQueueSize === 0) {
        throw new Error('WebSocket outgoing queue is disabled')
      }
      if (sendQueue.length >= maxOutgoingQueueSize) {
        throw new Error('WebSocket send queue overflow')
      }
      sendQueue.push(serialized)
    },
  }
}

function flushSendQueue(socket: WebSocketHandle, queue: string[], openState: number): void {
  while (socket.readyState === openState) {
    const next = queue.shift()
    if (typeof next === 'undefined') {
      return
    }

    socket.send(next)
  }
}

function setSocketState(state: SocketRefState, next: WebSocketState): void {
  if (state.status === next) {
    return
  }

  state.status = next
  state.transition += 1
  const transition = state.transition
  for (const listener of [...state.listeners.stateChange]) {
    if (state.transition !== transition) {
      break
    }
    try {
      const result = (listener as (state: WebSocketState) => unknown)(next)
      const runtimeErrorListeners = [...state.listeners.runtimeError]
      consumeObserverResult(result, (error) => emitRuntimeErrorToListeners(runtimeErrorListeners, error))
    } catch (error) {
      emitRuntimeError(state, error)
    }
  }
}

function emitRuntimeError(state: SocketRefState, error: unknown): void {
  emitRuntimeErrorToListeners([...state.listeners.runtimeError], error)
}

async function notifyWebSocketInvalidEvent(
  onInvalidEvent: ClientWebSocketOptions['onInvalidEvent'],
  context: {
    reason: 'missing-struct'
    message: { type: string; data: unknown }
  },
  signal: AbortSignal,
): Promise<void> {
  if (!onInvalidEvent) {
    return
  }

  try {
    await awaitWithSignal(() => onInvalidEvent(context), signal)
  } catch {
    // onInvalidEvent is an observer; observer failures must not tear down the session.
  }
}

function emitRuntimeErrorToListeners(listeners: readonly ((error: unknown) => void)[], error: unknown): void {
  for (const listener of listeners) {
    try {
      const result = (listener as (error: unknown) => unknown)(error)
      consumeObserverResult(result, reportObserverError)
    } catch (observerError) {
      reportObserverError(observerError)
    }
  }
}

function reportObserverError(error: unknown): void {
  const reportError = (globalThis as typeof globalThis & { reportError?: (error: unknown) => void }).reportError
  if (typeof reportError !== 'function') {
    return
  }
  try {
    const result = (reportError as (error: unknown) => unknown)(error)
    consumeObserverResult(result, () => undefined)
  } catch {
    // Reporting observer failures must never re-enter the session lifecycle.
  }
}

function consumeObserverResult(result: unknown, onRejected: (error: unknown) => void): void {
  if ((typeof result !== 'object' || result === null) && typeof result !== 'function') {
    return
  }
  void Promise.resolve(result).catch(onRejected)
}

function validateWebSocketQueueLimits(maxIncomingQueueSize: number, maxOutgoingQueueSize: number | undefined): void {
  if (!Number.isSafeInteger(maxIncomingQueueSize) || maxIncomingQueueSize < 1) {
    throw new TypeError('maxIncomingQueueSize must be a positive safe integer')
  }

  const outgoingSize = maxOutgoingQueueSize ?? 0
  if (!Number.isSafeInteger(outgoingSize) || outgoingSize < 0) {
    throw new TypeError('maxOutgoingQueueSize must be a non-negative safe integer')
  }
}

function validateWebSocketClose(code: number | undefined, reason: string | undefined): void {
  if (typeof code !== 'undefined' && (!Number.isInteger(code) || (code !== 1000 && (code < 3000 || code > 4999)))) {
    throw new DOMException('The close code must be 1000 or between 3000 and 4999', 'InvalidAccessError')
  }
  if (typeof reason !== 'undefined' && new TextEncoder().encode(reason).byteLength > 123) {
    throw new DOMException('The close reason must not exceed 123 UTF-8 bytes', 'SyntaxError')
  }
}

function requestNativeCloseBestEffort(socket: WebSocketHandle): void {
  try {
    socket.close()
  } catch {
    // Logical settlement must not depend on a conforming native close implementation.
  }
}

function installPhysicalCleanup(socket: WebSocketHandle, sessionController: { currentSocket: WebSocketHandle | undefined }): () => void {
  let detached = false
  const cleanup = () => {
    if (detached) {
      return
    }
    detached = true
    socket.removeEventListener('close', cleanup)
    /* istanbul ignore else -- @preserve invariant: no replacement socket is created while physical cleanup is pending */
    if (sessionController.currentSocket === socket) {
      sessionController.currentSocket = undefined
    }
  }
  socket.addEventListener('close', cleanup, { once: true })
  return cleanup
}

function toClosedInfo(snapshot: WebSocketCloseSnapshot, fallback?: ManualSocketCloseReason): WebSocketCloseInfo {
  return {
    code: snapshot.code ?? fallback?.code,
    kind: 'closed',
    reason: snapshot.reason ?? fallback?.reason,
    wasClean: snapshot.wasClean,
  }
}

function toAbortedInfo(snapshot: WebSocketCloseSnapshot, cause: unknown): WebSocketCloseInfo {
  return {
    cause,
    code: snapshot.code,
    kind: 'aborted',
    reason: snapshot.reason,
    wasClean: snapshot.wasClean,
  }
}

function toErrorInfo(snapshot: WebSocketCloseSnapshot, cause: unknown): WebSocketCloseInfo {
  return {
    cause,
    code: snapshot.code,
    kind: 'error',
    reason: snapshot.reason,
    wasClean: snapshot.wasClean,
  }
}

function requestErrorFromCloseInfo(closeInfo: WebSocketCloseInfo): RequestError<unknown> {
  if (closeInfo.kind !== 'closed' && isRequestError(closeInfo.cause)) {
    return closeInfo.cause
  }
  /* istanbul ignore if -- @preserve invariant: internal abort terminal paths always supply startupError directly */
  if (closeInfo.kind === 'aborted') {
    return createTransportError(ERR_ABORTED)
  }
  /* istanbul ignore else -- @preserve invariant: pre-open closed paths supply startupError before this helper is reached */
  if (closeInfo.kind === 'error') {
    return createTransportError(closeInfo.cause)
  }
  /* istanbul ignore next -- @preserve invariant: pre-open closed paths supply startupError before this helper is reached */
  return createTransportError(new Error('WebSocket closed before open'))
}

function isRequestError(value: unknown): value is RequestError<unknown> {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false
  }
  return value.kind === 'definition' || value.kind === 'http' || value.kind === 'transport'
}
