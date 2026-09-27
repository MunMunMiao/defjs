import type { FetchHandle } from '../../client/config'
import type { FaultCode } from '../../error'
import { ERR_TIMEOUT } from '../../error'
import { createFetchInitBase } from '../../http/transport/fetch_init'
import { awaitWithSignal, mergeAbortSignals, resolveAbortedCause } from '../../internal/abort'
import { AsyncQueue } from '../../internal/async_queue'
import { computeReconnectDelay, wait } from '../../internal/backoff'
import type { HttpRequest } from '../../internal/http_request'
import type { HttpResponse } from '../../internal/http_response'
import { makeResponse } from '../../internal/http_response'
import { resolveRequestUrl } from '../../internal/url'
import type { AnyStruct } from '../../struct'
import { parseStructValue } from '../../struct/introspection'
import type { EventStreamMessage } from './parser'
import { createLineParser, createMessageParser, readStreamBytes, SSEParserLimitError } from './parser'

export const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream'
export const LAST_EVENT_ID_HEADER = 'last-event-id'
const DEFAULT_RETRY_INTERVAL = 1000

/** Metadata available after an SSE response opens successfully. */
export interface EventStreamOpenInfo {
  response: HttpResponse<unknown>
  url: string
}

/**
 * Fault codes an event stream can end with, drawn from the one shared `FaultCode` namespace.
 *
 * SSE used to carry a parallel set with no mapping to the request error model.
 */
export type EventStreamFaultCode = Extract<
  FaultCode,
  | 'CAP_BUFFER_EXCEEDED'
  | 'CAP_QUEUE_OVERFLOW'
  | 'EXT_HOOK_FAILED'
  | 'EXT_OBSERVER_FAILED'
  | 'NET_TIMEOUT'
  | 'NET_UNREACHABLE'
  | 'RES_DECODE_FAILED'
  | 'RES_MEDIA_TYPE_INVALID'
>

interface EventStreamCloseInfoBase {
  reason?: string
  cause?: unknown
}

/**
 * How an SSE stream ended: clean EOF, abort, or an error carrying its fault `code`.
 *
 * The discriminant is `kind` so that `code` can mean the same thing it means on a fault.
 */
export type EventStreamCloseInfo =
  | (EventStreamCloseInfoBase & { kind: 'eof' })
  | (EventStreamCloseInfoBase & { kind: 'aborted' })
  | (EventStreamCloseInfoBase & { code: EventStreamFaultCode; kind: 'error' })

/** Open SSE stream: iterate events, inspect open metadata, and close early. */
export interface EventStreamHandle<TEvent = EventStreamMessage> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}

export interface SSEReconnectOptions {
  attempts?: number
  delayMs?: number
  factor?: number
  jitter?: number
  maxDelayMs?: number
  shouldReconnect?: (context: {
    attempt: number
    cause?: unknown
    lastEventId: string
    open?: EventStreamOpenInfo
  }) => boolean | Promise<boolean>
}

export interface FetchEventStreamOptions<TEvent = EventStreamMessage> {
  fetch?: FetchHandle
  /** Optional struct for a non-2xx handshake body; fills the fault's `data` when declared. */
  handshakeError?: AnyStruct
  onopen?: (open: EventStreamOpenInfo) => void | Promise<void>
  onclose?: (open: EventStreamOpenInfo) => void | Promise<void>
  onerror?: (error: unknown, context: FetchEventStreamErrorContext) => number | null | undefined | Promise<number | null | undefined>
  transformMessage?: (message: EventStreamMessage, signal: AbortSignal) => Promise<TEvent | undefined> | TEvent | undefined
  retryInterval?: number
  reconnect?: SSEReconnectOptions
  maxBufferSize: number
  maxQueueSize: number
}

export interface FetchEventStreamErrorContext {
  lastEventId: string
  retryCount: number
  retryInterval: number
  open?: EventStreamOpenInfo
}

type EventStreamFatalCode = Exclude<EventStreamFaultCode, 'NET_TIMEOUT' | 'NET_UNREACHABLE'>

class EventStreamFatalError extends Error {
  readonly code: EventStreamFatalCode
  cause?: unknown

  constructor(code: EventStreamFatalCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'EventStreamFatalError'
    this.code = code
    this.cause = options?.cause
  }
}

export function getEventStreamFatalCode(error: unknown): EventStreamFatalCode | undefined {
  return error instanceof EventStreamFatalError ? error.code : undefined
}

function toEventStreamFatalError(error: unknown): EventStreamFatalError | undefined {
  if (error instanceof EventStreamFatalError) {
    return error
  }
  if (error instanceof SSEParserLimitError) {
    return new EventStreamFatalError('CAP_BUFFER_EXCEEDED', error.message, { cause: error })
  }
  return undefined
}

export async function fetchEventStream<TEvent = EventStreamMessage>(
  request: HttpRequest,
  options: FetchEventStreamOptions<TEvent>,
): Promise<EventStreamHandle<TEvent>> {
  const queue = new AsyncQueue<TEvent>({ maxSize: options.maxQueueSize })
  const closedDeferred = Promise.withResolvers<EventStreamCloseInfo>()
  const openDeferred = Promise.withResolvers<EventStreamHandle<TEvent>>()
  const closeController = new AbortController()
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const headers = new Headers(request.headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', EVENT_STREAM_CONTENT_TYPE)
  }

  let settledClosed = false
  let settledOpen = false
  let retryInterval = options.retryInterval ?? options.reconnect?.delayMs ?? DEFAULT_RETRY_INTERVAL
  let retryCount = 0
  let lastEventId = ''
  let latestOpen: EventStreamOpenInfo | undefined
  let disposeTask: Promise<void> | undefined

  const handle: EventStreamHandle<TEvent> = {
    get open() {
      /* istanbul ignore if -- unreachable: handle is only returned after open resolves */
      if (!latestOpen) {
        throw new Error('Event stream has not been opened yet')
      }
      return latestOpen
    },
    closed: closedDeferred.promise,
    close,
    [Symbol.asyncDispose]() {
      return disposeHandle()
    },
    [Symbol.asyncIterator]() {
      const iterator = queue[Symbol.asyncIterator]()
      let returned = false
      return {
        next() {
          return returned ? Promise.resolve({ done: true, value: undefined }) : iterator.next()
        },
        return() {
          if (!returned) {
            returned = true
            handle.close('iterator-return')
          }
          return Promise.resolve({ done: true, value: undefined })
        },
      }
    },
  }

  // start() contains its terminal catch; this fallback only guards a type-invariant failure outside that catch.
  const lifecycleTask = start().catch(
    /* istanbul ignore next -- @preserve */
    (error: unknown) => {
      finishError(error)
    },
  )
  return openDeferred.promise

  function disposeHandle(): Promise<void> {
    return (disposeTask ??= Promise.resolve().then(disposeOnce))
  }

  async function disposeOnce(): Promise<void> {
    let closeError: unknown
    let hasCloseError = false
    try {
      handle.close()
    } catch (error) {
      hasCloseError = true
      closeError = error
      close()
    }

    await Promise.all([closedDeferred.promise, lifecycleTask])
    if (hasCloseError) {
      throw closeError
    }
  }

  function close(reason?: unknown): void {
    if (closeController.signal.aborted) {
      return
    }

    closeController.abort(reason)
    queue.close()
    settleClosed({
      kind: 'aborted',
      reason: toCloseReason(reason),
      cause: reason,
    })
  }

  async function start(): Promise<void> {
    while (!closeController.signal.aborted) {
      const attemptAbort = mergeAbortSignals(closeController.signal, [request.abort])
      let response: Response | undefined
      let readerStarted = false

      try {
        response = await fetchWithSignal(
          fetchImpl,
          new Request(resolveRequestUrl(request), createEventStreamRequestInit(request, headers, attemptAbort)),
          attemptAbort,
        )
        const open = await createOpenInfo(response, options.handshakeError)
        latestOpen = open

        validateOpenResponse(open)

        if (!response.body) {
          throw new EventStreamFatalError('RES_DECODE_FAILED', 'Missing response body for event stream')
        }

        await runFatalHook(() => options.onopen?.(open), attemptAbort, 'Event stream onopen callback failed')

        if (!settledOpen) {
          settledOpen = true
          openDeferred.resolve(handle)
        }

        readerStarted = true
        await consumeEventStream(response.body, attemptAbort)
        await runFatalHook(() => options.onclose?.(open), attemptAbort, 'Event stream onclose callback failed')

        queue.close()
        settleClosed({ kind: 'eof' })
        return
      } catch (error) {
        if (response?.body && !readerStarted) {
          void response.body.cancel(error).catch(() => undefined)
        }

        const normalizedError = normalizeAbortError(error, request.abort, closeController.signal)

        if (closeController.signal.aborted || request.abort?.aborted) {
          finishAborted(attemptAbort)
          return
        }

        const retryError = normalizedError ?? error
        const fatalError = toEventStreamFatalError(retryError)
        if (fatalError) {
          await observeFatalError(fatalError, attemptAbort)
          if (closeController.signal.aborted || request.abort?.aborted) {
            finishAborted(attemptAbort)
          } else {
            finishError(fatalError)
          }
          return
        }

        let retryDelay: number | null
        try {
          retryDelay = await resolveRetryDelay(retryError, attemptAbort)
        } catch (policyError) {
          if (closeController.signal.aborted || request.abort?.aborted) {
            finishAborted(attemptAbort)
          } else {
            finishError(policyError)
          }
          return
        }

        if (typeof retryDelay !== 'number' || retryDelay < 0) {
          finishError(retryError)
          return
        }

        try {
          await wait(retryDelay, attemptAbort)
        } catch (waitError) {
          // wait() rejects only from the merged close/request abort signal.
          /* istanbul ignore else -- @preserve */
          if (closeController.signal.aborted || request.abort?.aborted) {
            finishAborted(attemptAbort)
          } else {
            finishError(waitError)
          }
          return
        }
      }
    }
  }

  async function consumeEventStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const parseMessage = createMessageParser(
      (id) => {
        lastEventId = id
        if (id) {
          headers.set(LAST_EVENT_ID_HEADER, id)
        } else {
          headers.delete(LAST_EVENT_ID_HEADER)
        }
      },
      (retry) => {
        retryInterval = retry
      },
      async (message) => {
        let transformed: TEvent | undefined
        try {
          transformed = options.transformMessage
            ? await awaitWithSignal(() => options.transformMessage?.(message, signal), signal)
            : (message as TEvent)
        } catch (error) {
          if (signal.aborted) {
            throw error
          }
          throw new EventStreamFatalError('EXT_OBSERVER_FAILED', 'Failed to process event stream message', { cause: error })
        }

        if (typeof transformed !== 'undefined') {
          try {
            queue.push(transformed)
          } catch (error) {
            // AsyncQueue.push has one failure mode: exceeding its configured bound.
            throw new EventStreamFatalError('CAP_QUEUE_OVERFLOW', 'Event stream queue exceeded maxQueueSize', {
              cause: error,
            })
          }
        }
      },
      { maxBufferSize: options.maxBufferSize },
    )
    const parseLine = createLineParser(parseMessage, { maxBufferSize: options.maxBufferSize })

    try {
      await readStreamBytes(stream, parseLine, signal)
    } catch (error) {
      if (error instanceof SSEParserLimitError) {
        throw new EventStreamFatalError('CAP_BUFFER_EXCEEDED', error.message, { cause: error })
      }
      throw error
    }
  }

  async function resolveRetryDelay(error: unknown, signal: AbortSignal): Promise<number | null> {
    retryCount += 1

    const next = options.onerror
      ? await awaitWithSignal(
          () =>
            options.onerror?.(error, {
              lastEventId,
              retryCount,
              retryInterval,
              open: latestOpen,
            }),
          signal,
        )
      : undefined

    if (next === null) {
      return null
    }

    // Opt-in reconnect (match WebSocket): no reconnect object → do not retry.
    const reconnect = options.reconnect
    if (!reconnect) {
      return null
    }

    // 2. Check shouldReconnect
    if (reconnect.shouldReconnect) {
      const should = await awaitWithSignal(
        () =>
          reconnect.shouldReconnect?.({
            attempt: retryCount,
            cause: error,
            lastEventId,
            open: latestOpen,
          }),
        signal,
      )
      if (!should) {
        return null
      }
    }

    // 3. Check attempts limit (default 3 when reconnect is configured, like WebSocket)
    const attempts = reconnect.attempts ?? 3
    if (retryCount > attempts) {
      return null
    }

    const delayMs = typeof next === 'number' ? next : retryInterval
    const factor = reconnect.factor ?? 1
    const jitter = reconnect.jitter ?? 0
    if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
      throw new RangeError('SSE reconnect jitter is out of range')
    }
    const maxDelayMs = reconnect.maxDelayMs ?? Number.POSITIVE_INFINITY
    return computeReconnectDelay({ delayMs, factor, jitter, maxDelayMs }, retryCount)
  }

  async function observeFatalError(error: EventStreamFatalError, signal: AbortSignal): Promise<void> {
    if (!options.onerror) {
      return
    }

    try {
      await awaitWithSignal(
        () =>
          options.onerror?.(error, {
            lastEventId,
            retryCount,
            retryInterval,
            open: latestOpen,
          }),
        signal,
      )
    } catch {
      // Fatal errors own the terminal outcome; observers cannot replace them.
    }
  }

  async function runFatalHook(run: () => void | Promise<void> | undefined, signal: AbortSignal, fallback: string): Promise<void> {
    try {
      await awaitWithSignal(run, signal)
    } catch (error) {
      if (signal.aborted) {
        throw error
      }
      throw new EventStreamFatalError('EXT_HOOK_FAILED', error instanceof Error ? error.message : fallback, { cause: error })
    }
  }

  function finishAborted(signal: AbortSignal): void {
    const abortedError = normalizeAbortReason(signal)
    if (abortedError === ERR_TIMEOUT) {
      finishError(ERR_TIMEOUT)
      return
    }
    const closeCause = signal.reason
    attachOpenInfo(abortedError, latestOpen)

    if (settledOpen) {
      queue.close()
    } else {
      settledOpen = true
      openDeferred.reject(abortedError)
    }

    settleClosed({
      kind: 'aborted',
      reason: toCloseReason(closeCause),
      cause: closeCause,
    })
  }

  function finishError(error: unknown): void {
    attachOpenInfo(error, latestOpen)
    if (settledOpen) {
      queue.fail(error)
    } else {
      settledOpen = true
      openDeferred.reject(error)
    }

    settleClosed({
      cause: error,
      code: getEventStreamFaultCode(error),
      kind: 'error',
      reason: toCloseReason(error),
    })
  }

  function settleClosed(info: EventStreamCloseInfo): void {
    if (settledClosed) {
      return
    }

    settledClosed = true
    closedDeferred.resolve(info)
  }
}

function getEventStreamFaultCode(error: unknown): EventStreamFaultCode {
  return getEventStreamFatalCode(error) ?? (error === ERR_TIMEOUT ? 'NET_TIMEOUT' : 'NET_UNREACHABLE')
}

async function fetchWithSignal(fetchImpl: FetchHandle, request: Request, signal: AbortSignal): Promise<Response> {
  return await awaitWithSignal(() => {
    const pending = Promise.resolve(fetchImpl(request))
    void pending
      .then((response) => {
        if (signal.aborted && response.body) {
          discardStreamBody(response.body, signal.reason)
        }
      })
      .catch(() => undefined)
    return pending
  }, signal)
}

/** Release a body we will not read, ignoring a cancellation the provider refuses. */
function discardStreamBody(body: ReadableStream<Uint8Array>, reason?: unknown): void {
  void body.cancel(reason).catch(() => undefined)
}

async function createOpenInfo(response: Response, handshakeError?: AnyStruct): Promise<EventStreamOpenInfo> {
  let body: unknown = null

  if (!response.ok && handshakeError) {
    try {
      body = parseStructValue(handshakeError, await response.json())
    } catch {
      // Philosophy 5 at the handshake: a body we could not read as declared is reported as an
      // undecoded status fault, not as a second failure about the body.
      body = null
    }
  } else if (!response.ok && response.body) {
    discardStreamBody(response.body)
  }

  const openResponse = makeResponse<unknown>({
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url,
    body,
  })

  return {
    response: openResponse,
    url: response.url,
  }
}

function createEventStreamRequestInit(request: HttpRequest, headers: Headers, abort?: AbortSignal): RequestInit & { duplex?: 'half' } {
  return createFetchInitBase(request, {
    defaultAccept: EVENT_STREAM_CONTENT_TYPE,
    headers,
    signal: abort,
    streamingRequestUnsupportedError: new Error('ERR_STREAMING_REQUEST_UNSUPPORTED'),
  })
}

function validateOpenResponse(open: EventStreamOpenInfo): void {
  const { response } = open
  // A non-2xx handshake is a status fault, which `executeEventStreamCommand` builds from the open
  // info; the code here is only the fallback for a response that never carried a status.
  if (!response.ok) {
    throw new EventStreamFatalError('RES_DECODE_FAILED', 'Event stream request failed')
  }

  const contentType = response.headers.get('content-type') || ''
  if (parseMediaTypeEssence(contentType) !== EVENT_STREAM_CONTENT_TYPE) {
    throw new EventStreamFatalError(
      'RES_MEDIA_TYPE_INVALID',
      `Expected content-type to start with ${EVENT_STREAM_CONTENT_TYPE}, got ${contentType || '(empty)'}`,
    )
  }
}

function parseMediaTypeEssence(value: string): string | undefined {
  let position = 0
  const readToken = (): string | undefined => {
    const start = position
    while (position < value.length && isHttpTokenChar(value.charCodeAt(position))) {
      position += 1
    }
    return position > start ? value.slice(start, position) : undefined
  }
  const skipWhitespace = () => {
    while (value[position] === ' ' || value[position] === '\t') {
      position += 1
    }
  }

  const type = readToken()
  if (!type || value[position] !== '/') {
    return undefined
  }
  position += 1
  const subtype = readToken()
  if (!subtype) {
    return undefined
  }

  while (true) {
    skipWhitespace()
    if (position === value.length) {
      return `${type.toLowerCase()}/${subtype.toLowerCase()}`
    }
    if (value[position] !== ';') {
      return undefined
    }
    position += 1
    skipWhitespace()

    if (!readToken()) {
      return undefined
    }
    skipWhitespace()
    if (value[position] !== '=') {
      return undefined
    }
    position += 1
    skipWhitespace()

    if (value[position] === '"') {
      position += 1
      let closed = false
      while (position < value.length) {
        const code = value.charCodeAt(position)
        if (code === 0x22) {
          position += 1
          closed = true
          break
        }
        if (code === 0x5c) {
          position += 1
          if (position >= value.length || !isQuotedPairChar(value.charCodeAt(position))) {
            return undefined
          }
        } else if (!isQuotedTextChar(code)) {
          return undefined
        }
        position += 1
      }
      if (!closed) {
        return undefined
      }
    } else if (!readToken()) {
      return undefined
    }
  }
}

function isHttpTokenChar(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x21 ||
    code === 0x23 ||
    code === 0x24 ||
    code === 0x25 ||
    code === 0x26 ||
    code === 0x27 ||
    code === 0x2a ||
    code === 0x2b ||
    code === 0x2d ||
    code === 0x2e ||
    code === 0x5e ||
    code === 0x5f ||
    code === 0x60 ||
    code === 0x7c ||
    code === 0x7e
  )
}

function isQuotedTextChar(code: number): boolean {
  return code === 0x09 || code === 0x20 || code === 0x21 || (code >= 0x23 && code <= 0x5b) || (code >= 0x5d && code <= 0x7e) || code >= 0x80
}

function isQuotedPairChar(code: number): boolean {
  return code === 0x09 || code === 0x20 || (code >= 0x21 && code <= 0x7e) || code >= 0x80
}

function normalizeAbortError(error: unknown, requestAbort?: AbortSignal, closeAbort?: AbortSignal): unknown {
  const signal = closeAbort?.aborted ? closeAbort : requestAbort?.aborted ? requestAbort : undefined
  if (!signal?.aborted) {
    return error
  }

  return normalizeAbortReason(signal)
}

function normalizeAbortReason(signal: AbortSignal): Error {
  return resolveAbortedCause(signal)
}

function toCloseReason(reason: unknown): string | undefined {
  if (reason instanceof Error) {
    return reason.message
  }

  if (typeof reason === 'string') {
    return reason
  }

  return undefined
}

const errorOpenInfoMap = new WeakMap<object, EventStreamOpenInfo>()

function attachOpenInfo(error: unknown, open?: EventStreamOpenInfo): void {
  if (!open || typeof error !== 'object' || error === null) {
    return
  }

  errorOpenInfoMap.set(error, open)
}

export function getErrorOpenInfo(error: unknown): EventStreamOpenInfo | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  return errorOpenInfoMap.get(error)
}
