import { resolveClientConfig } from '../client/client'
import type {
  ClientConfig,
  WebSocketBeforeConnect,
  WebSocketHeartbeatOptions,
  WebSocketQueueOptions,
  WebSocketReconnectOptions,
} from '../client/config'
import type { Client } from '../client/resolve'
import { createDefinitionError, createTransportError, ERR_ABORTED, ERR_TIMEOUT, type RequestError, type TransportError } from '../error'
import { mergeAbortSignals } from '../internal/abort'
import { type EndpointInput, type ParsedInput, parseEndpointInput } from '../internal/endpoint_input'
import type { RequestBuild, RequestBuildHandler } from '../internal/request_builder'
import {
  type AnyCompatibleSchema,
  type CompatibleInputOf,
  type CompatibleOutputOf,
  isStandardSchemaLike,
  parseCompatibleSchema,
  SchemaError,
} from '../schema'
import { createWebSocketBuild, createWebSocketUrl } from './build'

export type WebSocketState = 'aborted' | 'closed' | 'closing' | 'connecting' | 'error' | 'idle' | 'open' | 'reconnecting'

export type SocketSchemas = Record<string, AnyCompatibleSchema>

type KnownSocketKey<TMessages extends SocketSchemas> = Exclude<Extract<keyof TMessages, string>, 'default'>

type NormalizeSocketMessage<TKey extends string, TPayload> =
  TPayload extends Record<string, unknown>
    ? { type: TKey } & TPayload
    : {
        data: TPayload
        type: TKey
      }

type SocketSendMessage<TKey extends string, TPayload> =
  TPayload extends Record<string, unknown>
    ?
        | ({ type: TKey } & TPayload)
        | {
            data: TPayload
            type: TKey
          }
    : {
        data: TPayload
        type: TKey
      }

type KnownIncomingSocketUnion<TIncoming extends SocketSchemas> = {
  [K in KnownSocketKey<TIncoming>]: NormalizeSocketMessage<K, CompatibleOutputOf<TIncoming[K]>>
}[KnownSocketKey<TIncoming>]

type DefaultIncomingSocketUnion<TIncoming extends SocketSchemas> = 'default' extends keyof TIncoming
  ? NormalizeSocketMessage<string, CompatibleOutputOf<TIncoming['default']>>
  : never

export type WebSocketIncomingData<TIncoming extends SocketSchemas> = [
  KnownIncomingSocketUnion<TIncoming> | DefaultIncomingSocketUnion<TIncoming>,
] extends [never]
  ? never
  : KnownIncomingSocketUnion<TIncoming> | DefaultIncomingSocketUnion<TIncoming>

type KnownOutgoingSocketUnion<TOutgoing extends SocketSchemas> = {
  [K in KnownSocketKey<TOutgoing>]: SocketSendMessage<K, CompatibleInputOf<TOutgoing[K]>>
}[KnownSocketKey<TOutgoing>]

export type WebSocketOutgoingData<TOutgoing extends SocketSchemas | undefined> = TOutgoing extends SocketSchemas
  ? [KnownOutgoingSocketUnion<TOutgoing>] extends [never]
    ? never
    : KnownOutgoingSocketUnion<TOutgoing>
  : never

export interface WebSocketDefinition<
  TInput extends AnyCompatibleSchema | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
> {
  build?: RequestBuildHandler<ParsedInput<TInput>>
  incoming: TIncoming
  input?: TInput
  outgoing?: TOutgoing
  path: string
  protocols?: readonly string[]
}

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

export interface UseWebSocketConfig<TIncoming = unknown, TOutgoing = unknown> {
  abort?: AbortSignal
  beforeConnect?: WebSocketBeforeConnect
  client?: Client
  heartbeat?: WebSocketHeartbeatConfig<TIncoming, TOutgoing>
  protocols?: readonly string[]
  queue?: WebSocketQueueConfig
  reconnect?: WebSocketReconnectConfig
  timeout?: number
}

export interface WebSocketRef<TIncoming = unknown, TOutgoing = never> extends PromiseLike<SocketAwaitResult<TIncoming, TOutgoing>> {
  readonly connection?: WebSocketConnectionInfo
  readonly error?: RequestError<unknown>
  readonly status: WebSocketState
  close(code?: number, reason?: string): void
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: WebSocketState) => void): () => void
  with(config: UseWebSocketConfig<TIncoming, TOutgoing>): WebSocketRef<TIncoming, TOutgoing>
}

type IsInputOptional<TInput extends AnyCompatibleSchema | undefined> = [TInput] extends [undefined]
  ? true
  : undefined extends CompatibleInputOf<NonNullable<TInput>>
    ? true
    : false

export type UseWebSocketEndpointFn<
  TInput extends AnyCompatibleSchema | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => WebSocketRef<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>
    : (input: EndpointInput<TInput>) => WebSocketRef<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>

type WebSocketEndpoint<
  TInput extends AnyCompatibleSchema | undefined = undefined,
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

type ManualSocketCloseReason = {
  code?: number
  kind: 'manual-web-socket-close'
  reason?: string
}

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

type PendingNext<T> = {
  reject: (reason?: unknown) => void
  resolve: (value: IteratorResult<T>) => void
}

export type WebSocketReconnectConfig = WebSocketReconnectOptions
export type WebSocketHeartbeatConfig<TIncoming = unknown, TOutgoing = unknown> = Omit<WebSocketHeartbeatOptions, 'isAck' | 'message'> & {
  isAck?: (message: TIncoming) => boolean
  message?: <T = TOutgoing>() => T | unknown
}
export type WebSocketQueueConfig = WebSocketQueueOptions

export function defineWebSocket<
  TInput extends AnyCompatibleSchema | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinition<TInput, TIncoming, TOutgoing>): UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing> {
  const endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing> = {
    ...definition,
    kind: 'web-socket' as const,
  }

  return ((input?: EndpointInput<TInput>) => createWebSocketRef(endpoint, input)) as UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing>
}

function createWebSocketRef<
  TInput extends AnyCompatibleSchema | undefined,
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
      controller.abort({ code, kind: 'manual-web-socket-close', reason } satisfies ManualSocketCloseReason)
      state.socket?.close(code, reason)
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
  TInput extends AnyCompatibleSchema | undefined,
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

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError
    setSocketState(state, 'error')
    return [definitionError, undefined, undefined]
  }

  let built: RequestBuild
  try {
    built = createWebSocketBuild(parsedInput, endpoint.build)
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
    setSocketState(state, transportError.code === 'ABORTED' ? 'aborted' : 'error')
    return [transportError, undefined, undefined]
  }

  const signal = mergeAbortSignals(controller.signal, [config?.abort], config?.timeout)
  const abortedBeforeStart = resolveAbortTransportError(signal)
  if (abortedBeforeStart) {
    state.error = abortedBeforeStart
    setSocketState(state, abortedBeforeStart.code === 'ABORTED' ? 'aborted' : 'error')
    return [abortedBeforeStart, undefined, undefined]
  }

  if (typeof globalThis.WebSocket !== 'function') {
    const transportError = createTransportError(new Error('WebSocket is not supported in current runtime'))
    state.error = transportError
    setSocketState(state, 'error')
    return [transportError, undefined, undefined]
  }

  return await new Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>(resolve => {
    const incomingQueue = new AsyncMessageQueue<WebSocketIncomingData<TIncoming>>()
    const closedDeferred = createDeferred<WebSocketCloseInfo>()
    const sessionController = {
      currentSocket: undefined as WebSocket | undefined,
      heartbeat: undefined as HeartbeatRuntime<WebSocketIncomingData<TIncoming>> | undefined,
      lastRuntimeError: undefined as unknown,
    }
    const sendQueue = createSendQueue(config?.queue ?? clientConfig.webSocket.queue)
    const session = createWebSocketSession(
      endpoint.outgoing,
      incomingQueue,
      closedDeferred.promise,
      state,
      sessionController,
      sendQueue,
    ) as WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>

    let startupSettled = false
    let finished = false
    let latestConnection: WebSocketConnectionInfo | undefined
    let attempt = 0

    const reconnect = normalizeReconnectConfig(config?.reconnect ?? clientConfig.webSocket.reconnect)
    const heartbeatConfig = (config?.heartbeat ?? clientConfig.webSocket.heartbeat) as
      | WebSocketHeartbeatConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>
      | undefined
    const beforeConnect = config?.beforeConnect ?? clientConfig.webSocket.beforeConnect
    const baseProtocols = [...(config?.protocols ?? clientConfig.webSocket.protocols ?? endpoint.protocols ?? [])]

    void run()

    async function run(): Promise<void> {
      while (!finished) {
        if (signal.aborted) {
          finishWithAbort()
          return
        }

        const nextState = attempt === 0 ? 'connecting' : 'reconnecting'
        setSocketState(state, nextState)

        const prepared = await prepareAttempt(attempt)
        if (!prepared.ok) {
          finishStartFailure(prepared.error)
          return
        }

        const outcome = await connectOnce(prepared.url, prepared.protocols, attempt)
        latestConnection = outcome.connection ?? latestConnection
        state.connection = latestConnection

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
            } catch {
              finishWithAbort(outcome.closeInfo)
              return
            }
          }
          continue
        }

        if (!startupSettled) {
          finishStartFailure(createTransportError(outcome.cause ?? new Error('WebSocket closed before open')), outcome.connection)
          return
        }

        finalizeClosed(outcome.closeInfo)
        return
      }
    }

    async function prepareAttempt(
      currentAttempt: number,
    ): Promise<{ ok: true; protocols: readonly string[]; url: string } | { error: RequestError<unknown>; ok: false }> {
      let url: string
      try {
        url = createWebSocketUrl(clientConfig.endpoint, endpoint.path, built.params, built.query, clientConfig.queryParamsSerializer)
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

    async function connectOnce(url: string, protocols: readonly string[], currentAttempt: number): Promise<SocketLifecycleOutcome> {
      let socket: WebSocket
      try {
        socket = protocols.length > 0 ? new globalThis.WebSocket(url, [...protocols]) : new globalThis.WebSocket(url)
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

      return await new Promise<SocketLifecycleOutcome>(resolveAttempt => {
        const cleanup = () => {
          stopHeartbeat(sessionController)
          socket.removeEventListener('open', handleOpen)
          socket.removeEventListener('message', handleMessage)
          socket.removeEventListener('close', handleClose)
          socket.removeEventListener('error', handleError)
          signal.removeEventListener('abort', handleAbort)
          sessionController.currentSocket = undefined
        }

        const connectionInfo = (): WebSocketConnectionInfo => ({
          extensions: socket.extensions || undefined,
          protocol: socket.protocol || undefined,
          url: socket.url || url,
        })

        const handleAbort = () => {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            try {
              setSocketState(state, 'closing')
              socket.close()
            } catch {
              // noop
            }
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
            resolve([null, session, latestConnection])
          }
          flushSendQueue(socket, sendQueue, state)
          startHeartbeat(socket, sessionController, heartbeatConfig, endpoint.outgoing, sendQueue, state)
        }

        const handleMessage = async (event: MessageEvent) => {
          const transformed = await transformWebSocketMessage(endpoint.incoming, event.data)
          if (typeof transformed === 'undefined') {
            return
          }

          if (sessionController.heartbeat?.isAck?.(transformed)) {
            sessionController.heartbeat.markAck()
            return
          }

          incomingQueue.push(transformed)
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
        socket.addEventListener('message', event => {
          void handleMessage(event)
        })
        socket.addEventListener('close', handleClose)
        socket.addEventListener('error', handleError)
      })
    }

    function finishStartFailure(error: RequestError<unknown>, connection?: WebSocketConnectionInfo): void {
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
      resolve([error, undefined, connection])
    }

    function finishWithAbort(closeInfo?: WebSocketCloseInfo): void {
      if (!startupSettled) {
        const transportError = resolveAbortTransportError(signal) ?? createTransportError(ERR_ABORTED)
        finishStartFailure(transportError, latestConnection)
        return
      }

      finalizeClosed(
        closeInfo ?? {
          cause: signal.reason,
          reason: signal.reason instanceof Error ? signal.reason.message : undefined,
        },
      )
    }

    function finalizeClosed(closeInfo: WebSocketCloseInfo): void {
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
          setSocketState(state, state.error?.kind === 'transport' && state.error.code === 'ABORTED' ? 'aborted' : 'error')
        }
      } else if (closeInfo.cause) {
        setSocketState(state, 'closed')
      } else {
        setSocketState(state, 'closed')
      }

      sendQueue.clear()
      incomingQueue.close()
      closedDeferred.resolve(closeInfo)
    }
  })
}

class AsyncMessageQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiting: PendingNext<T>[] = []
  private done = false

  push(value: T): void {
    if (this.done) {
      return
    }

    const pending = this.waiting.shift()
    if (pending) {
      pending.resolve({ done: false, value })
      return
    }

    this.values.push(value)
  }

  close(): void {
    if (this.done) {
      return
    }

    this.done = true
    while (this.waiting.length > 0) {
      this.waiting.shift()?.resolve({ done: true, value: undefined })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length > 0) {
          return Promise.resolve({
            done: false,
            value: this.values.shift() as T,
          })
        }

        if (this.done) {
          return Promise.resolve({ done: true, value: undefined })
        }

        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiting.push({ reject, resolve })
        })
      },
    }
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

type SocketLifecycleOutcome = {
  closeInfo: WebSocketCloseInfo
  connection?: WebSocketConnectionInfo
  cause?: unknown
  opened: boolean
}

type SendQueue = {
  clear(): void
  enqueue(serialized: string): void
  shift(): string | undefined
}

type HeartbeatRuntime<TIncoming> = {
  isAck?: (message: TIncoming) => boolean
  markAck(): void
  stop(): void
}

function createSendQueue(config?: WebSocketQueueConfig): SendQueue {
  const queue: string[] = []
  const maxSize = config?.maxSize ?? Number.POSITIVE_INFINITY
  const overflow = config?.overflow ?? 'drop-oldest'

  return {
    clear() {
      queue.length = 0
    },
    enqueue(serialized) {
      if (queue.length < maxSize) {
        queue.push(serialized)
        return
      }

      switch (overflow) {
        case 'drop-newest':
          return
        case 'drop-oldest':
          queue.shift()
          queue.push(serialized)
          return
        case 'error':
          throw new Error('WebSocket send queue overflow')
      }
    },
    shift() {
      return queue.shift()
    },
  }
}

function createWebSocketSession<TIncoming, TOutgoing extends SocketSchemas | undefined>(
  outgoing: TOutgoing,
  queue: AsyncMessageQueue<TIncoming>,
  closed: Promise<WebSocketCloseInfo>,
  state: SocketRefState<TIncoming, WebSocketOutgoingData<TOutgoing>>,
  sessionController: {
    currentSocket: WebSocket | undefined
    heartbeat: HeartbeatRuntime<TIncoming> | undefined
    lastRuntimeError: unknown
  },
  sendQueue: SendQueue,
): WebSocketSession<TIncoming, WebSocketOutgoingData<TOutgoing>> {
  return {
    closed,
    close(code?: number, reason?: string) {
      sessionController.currentSocket?.close(code, reason)
    },
    get state() {
      return state.status
    },
    onRuntimeError(listener) {
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
      if (sessionController.currentSocket?.readyState === WebSocket.OPEN) {
        sessionController.currentSocket.send(serialized)
        return
      }

      sendQueue.enqueue(serialized)
    },
  }
}

function flushSendQueue(socket: WebSocket, queue: SendQueue, state: SocketRefState<unknown, unknown>): void {
  while (socket.readyState === WebSocket.OPEN) {
    const next = queue.shift()
    if (!next) {
      return
    }

    try {
      socket.send(next)
    } catch (error) {
      state.error = createTransportError(error)
      emitRuntimeError(state, error)
      return
    }
  }
}

function startHeartbeat<TIncoming, TOutgoing extends SocketSchemas | undefined>(
  socket: WebSocket,
  sessionController: {
    currentSocket: WebSocket | undefined
    heartbeat: HeartbeatRuntime<TIncoming> | undefined
    lastRuntimeError: unknown
  },
  config: WebSocketHeartbeatConfig<TIncoming, WebSocketOutgoingData<TOutgoing>> | undefined,
  outgoing: TOutgoing,
  sendQueue: SendQueue,
  state: SocketRefState<TIncoming, WebSocketOutgoingData<TOutgoing>>,
): void {
  stopHeartbeat(sessionController)
  if (!config) {
    return
  }

  let ackTimer: ReturnType<typeof setTimeout> | undefined
  const interval = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }

    const nextMessage = resolveHeartbeatMessage(config.message)
    if (typeof nextMessage === 'undefined') {
      return
    }

    try {
      const serialized = serializeOutgoingWebSocketMessage(outgoing, nextMessage as WebSocketOutgoingData<TOutgoing>)
      socket.send(serialized)
    } catch (error) {
      emitRuntimeError(state, error)
      return
    }

    if (typeof config.timeoutMs === 'number' && config.timeoutMs > 0) {
      clearTimeout(ackTimer)
      ackTimer = setTimeout(() => {
        emitRuntimeError(state, new Error('WebSocket heartbeat timeout'))
        try {
          socket.close(4000, 'heartbeat timeout')
        } catch {
          sendQueue.clear()
        }
      }, config.timeoutMs)
    }
  }, config.intervalMs)

  sessionController.heartbeat = {
    isAck: config.isAck,
    markAck() {
      clearTimeout(ackTimer)
      ackTimer = undefined
    },
    stop() {
      clearInterval(interval)
      clearTimeout(ackTimer)
      ackTimer = undefined
    },
  }
}

function stopHeartbeat(sessionController: { heartbeat: HeartbeatRuntime<any> | undefined }): void {
  sessionController.heartbeat?.stop()
  sessionController.heartbeat = undefined
}

function shouldReconnect(config: NormalizedReconnectConfig | undefined, outcome: SocketLifecycleOutcome, attempt: number): boolean {
  if (!config) {
    return false
  }

  if (outcome.opened === false && config.attempts <= 0) {
    return false
  }

  return config.shouldReconnect(outcome, attempt)
}

type NormalizedReconnectConfig = {
  attempts: number
  delayMs: number
  factor: number
  jitter: number
  maxDelayMs: number
  shouldReconnect: (outcome: SocketLifecycleOutcome, attempt: number) => boolean
}

function normalizeReconnectConfig(config: WebSocketReconnectConfig | undefined): NormalizedReconnectConfig | undefined {
  if (!config) {
    return undefined
  }

  const attempts = config.attempts ?? 3
  if (attempts <= 0) {
    return undefined
  }

  return {
    attempts,
    delayMs: config.delayMs ?? 1_000,
    factor: config.factor ?? 2,
    jitter: config.jitter ?? 0,
    maxDelayMs: config.maxDelayMs ?? 30_000,
    shouldReconnect: (outcome, attempt) => {
      if (typeof config.shouldReconnect === 'function') {
        return Boolean(
          config.shouldReconnect({
            attempt,
            cause: outcome.cause,
            code: outcome.closeInfo.code,
            reason: outcome.closeInfo.reason,
            wasClean: outcome.closeInfo.wasClean,
          }),
        )
      }

      return true
    },
  }
}

function computeReconnectDelay(config: NormalizedReconnectConfig, attempt: number): number {
  const exponential = Math.min(config.delayMs * config.factor ** Math.max(0, attempt - 1), config.maxDelayMs)
  if (config.jitter <= 0) {
    return exponential
  }

  const random = 1 + (Math.random() * 2 - 1) * config.jitter
  return Math.max(0, Math.round(exponential * random))
}

function resolveHeartbeatMessage<T>(message?: <R = T>() => R | unknown): T | undefined {
  if (!message) {
    return undefined
  }

  return message() as T
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function serializeOutgoingWebSocketMessage<TOutgoing extends SocketSchemas | undefined>(
  schemas: TOutgoing,
  message: WebSocketOutgoingData<TOutgoing>,
): string {
  if (!schemas) {
    throw new Error('No outgoing WebSocket messages are declared for this endpoint')
  }

  if (!isRecord(message) || typeof message.type !== 'string' || message.type.length === 0) {
    throw new Error('Outgoing WebSocket messages must include a string type')
  }

  const schema = schemas[message.type]
  if (!schema) {
    throw new Error(`Undeclared outgoing message type: ${message.type}`)
  }

  const payload = 'data' in message ? message.data : omitSocketType(message)

  return JSON.stringify(normalizeSocketPayload(message.type, serializeCompatiblePayload(schema, payload)))
}

function serializeCompatiblePayload(schema: AnyCompatibleSchema, payload: unknown): unknown {
  // Outgoing validation should stay synchronous for send() ergonomics.
  if ('parse' in schema && typeof schema.parse === 'function') {
    return schema.parse(payload)
  }

  if (isStandardSchemaLike(schema)) {
    const result = schema['~standard'].validate(payload)
    if (result instanceof Promise) {
      throw new Error('Async Standard Schema validation is not supported for outgoing WebSocket messages')
    }

    if ('issues' in result) {
      throw new SchemaError(
        result.issues.map(issue => ({
          code: 'custom',
          expected: 'valid value',
          message: issue.message ?? 'Schema parse failed',
          path: Array.isArray(issue.path) ? [...issue.path] : [],
          received: undefined,
        })),
      )
    }

    return result.value
  }

  return payload
}

async function transformWebSocketMessage<TIncoming extends SocketSchemas>(
  incoming: TIncoming,
  raw: unknown,
): Promise<WebSocketIncomingData<TIncoming> | undefined> {
  const decoded = decodeWebSocketData(raw)
  if (!isRecord(decoded) || typeof decoded['type'] !== 'string' || decoded['type'].length === 0) {
    return undefined
  }

  const messageType = decoded['type']
  const schema = incoming[messageType] ?? incoming['default']
  if (!schema) {
    return undefined
  }

  const payload = 'data' in decoded ? decoded['data'] : omitSocketType(decoded)

  try {
    return normalizeSocketPayload(messageType, await parseCompatibleSchema(schema, payload)) as WebSocketIncomingData<TIncoming>
  } catch {
    return undefined
  }
}

function decodeWebSocketData(raw: unknown): unknown {
  if (typeof raw === 'string') {
    return decodeWebSocketText(raw)
  }

  if (raw instanceof ArrayBuffer) {
    return decodeWebSocketText(new TextDecoder().decode(raw))
  }

  if (ArrayBuffer.isView(raw)) {
    return decodeWebSocketText(new TextDecoder().decode(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)))
  }

  if (typeof Blob !== 'undefined' && raw instanceof Blob) {
    return undefined
  }

  return undefined
}

function decodeWebSocketText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function normalizeSocketPayload(type: string, payload: unknown): Record<string, unknown> {
  if (isRecord(payload)) {
    return {
      type,
      ...payload,
    }
  }

  return {
    data: payload,
    type,
  }
}

function omitSocketType(value: Record<string, unknown>): Record<string, unknown> {
  const { type: _type, ...payload } = value
  return payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractCloseInfo(event?: CloseEvent, cause?: unknown): WebSocketCloseInfo & { cause?: unknown } {
  return {
    cause,
    code: event?.code,
    reason: event?.reason,
    wasClean: event?.wasClean,
  }
}

function isManualSocketCloseReason(value: unknown): value is ManualSocketCloseReason {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'manual-web-socket-close'
}

function resolveAbortTransportError(signal: AbortSignal): TransportError | undefined {
  if (!signal.aborted) {
    return undefined
  }

  const reason = signal.reason
  if (isManualSocketCloseReason(reason)) {
    return createTransportError(ERR_ABORTED)
  }

  if (isTimeoutReason(reason)) {
    return createTransportError(ERR_TIMEOUT)
  }

  return createTransportError(reason ?? ERR_ABORTED)
}

function isTimeoutReason(value: unknown): boolean {
  return (
    value === ERR_TIMEOUT ||
    (value instanceof Error && value.message === ERR_TIMEOUT.message) ||
    (value instanceof DOMException && value.name === 'TimeoutError')
  )
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
