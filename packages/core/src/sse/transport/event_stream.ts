import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import { createFetchInitBase } from '../../http/transport/fetch_init'
import { awaitWithSignal, mergeAbortSignals, resolveAbortedTransportError } from '../../internal/abort'
import { AsyncQueue } from '../../internal/async_queue'
import { createDeferred } from '../../internal/deferred'
import type { HttpRequest } from '../../internal/http_request'
import type { HttpResponse } from '../../internal/http_response'
import { makeResponse } from '../../internal/http_response'
import { resolveRequestUrl } from '../../internal/url'
import type { EventStreamMessage } from './parser'
import { createLineParser, createMessageParser, readStreamBytes, SSEParserLimitError } from './parser'

export const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream'
export const LAST_EVENT_ID_HEADER = 'last-event-id'
const DEFAULT_RETRY_INTERVAL = 1000

export interface EventStreamOpenInfo {
  response: HttpResponse<null>
  url: string
}

export type EventStreamErrorCode =
  | 'INVALID_RESPONSE'
  | 'MESSAGE_PROCESSING_FAILED'
  | 'PARSER_LIMIT_EXCEEDED'
  | 'QUEUE_OVERFLOW'
  | 'TIMEOUT'
  | 'TRANSPORT_ERROR'

interface EventStreamCloseInfoBase {
  reason?: string
  cause?: unknown
}

export type EventStreamCloseInfo =
  | (EventStreamCloseInfoBase & { code: 'eof' })
  | (EventStreamCloseInfoBase & { code: 'aborted' })
  | (EventStreamCloseInfoBase & { code: 'error'; errorCode: EventStreamErrorCode })

export interface EventStreamHandle<TEvent = EventStreamMessage> extends AsyncIterable<TEvent> {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
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
  fetch?: typeof fetch
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

type EventStreamFatalCode = Exclude<EventStreamErrorCode, 'TIMEOUT' | 'TRANSPORT_ERROR'>

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
    return new EventStreamFatalError('PARSER_LIMIT_EXCEEDED', error.message, { cause: error })
  }
  return undefined
}

export async function fetchEventStream<TEvent = EventStreamMessage>(
  request: HttpRequest,
  options: FetchEventStreamOptions<TEvent>,
): Promise<EventStreamHandle<TEvent>> {
  const queue = new AsyncQueue<TEvent>({ maxSize: options.maxQueueSize })
  const closedDeferred = createDeferred<EventStreamCloseInfo>()
  const openDeferred = createDeferred<EventStreamHandle<TEvent>>()
  const closeController = new AbortController()
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const headers = cloneHeaders(request.headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', EVENT_STREAM_CONTENT_TYPE)
  }

  let settledClosed = false
  let settledOpen = false
  let retryInterval = options.retryInterval ?? options.reconnect?.delayMs ?? DEFAULT_RETRY_INTERVAL
  let retryCount = 0
  let lastEventId = ''
  let latestOpen: EventStreamOpenInfo | undefined

  const handle: EventStreamHandle<TEvent> = {
    get open() {
      /* istanbul ignore if -- unreachable: handle is only returned after open resolves */
      if (!latestOpen) {
        throw new Error('Event stream has not been opened yet')
      }
      return latestOpen
    },
    closed: closedDeferred.promise,
    close(reason?: unknown) {
      if (closeController.signal.aborted) {
        return
      }

      closeController.abort(reason)
      queue.close()
      settleClosed({
        code: 'aborted',
        reason: toCloseReason(reason),
        cause: reason,
      })
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
  void start().catch(
    /* istanbul ignore next -- @preserve */
    (error: unknown) => {
      finishError(error)
    },
  )
  return openDeferred.promise

  async function start(): Promise<void> {
    while (!closeController.signal.aborted) {
      const attemptAbort = mergeAbortSignals(closeController.signal, [request.abort])
      let response: Response | undefined
      let readerStarted = false

      try {
        response = await fetchWithSignal(fetchImpl, createEventStreamRequest(request, headers, attemptAbort), attemptAbort)
        const open = createOpenInfo(response)
        latestOpen = open

        validateOpenResponse(open)

        if (!response.body) {
          throw new EventStreamFatalError('INVALID_RESPONSE', 'Missing response body for event stream')
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
        settleClosed({ code: 'eof' })
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
          throw new EventStreamFatalError('MESSAGE_PROCESSING_FAILED', 'Failed to process event stream message', { cause: error })
        }

        if (typeof transformed !== 'undefined') {
          try {
            queue.push(transformed)
          } catch (error) {
            // AsyncQueue.push has one failure mode: exceeding its configured bound.
            throw new EventStreamFatalError('QUEUE_OVERFLOW', 'Event stream queue exceeded maxQueueSize', {
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
        throw new EventStreamFatalError('PARSER_LIMIT_EXCEEDED', error.message, { cause: error })
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

    // 2. Check shouldReconnect
    if (options.reconnect?.shouldReconnect) {
      const should = await awaitWithSignal(
        () =>
          options.reconnect?.shouldReconnect?.({
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

    // 3. Check attempts limit
    if (options.reconnect?.attempts !== undefined) {
      if (retryCount > options.reconnect.attempts) {
        return null
      }
    }

    // 4. Determine base delay
    let baseDelay = typeof next === 'number' ? next : retryInterval

    // 5. Apply exponential backoff / jitter / cap
    const { reconnect } = options
    if (reconnect) {
      const factor = reconnect.factor ?? 1
      if (factor > 1 && retryCount > 1) {
        baseDelay *= Math.pow(factor, retryCount - 1)
      }

      if (reconnect.maxDelayMs !== undefined && baseDelay > reconnect.maxDelayMs) {
        baseDelay = reconnect.maxDelayMs
      }

      if (reconnect.jitter !== undefined && reconnect.jitter > 0) {
        baseDelay += Math.random() * reconnect.jitter
      }
    }

    if (!Number.isFinite(baseDelay)) {
      throw new TypeError('SSE retry delay must be finite')
    }

    return Math.min(baseDelay, 2_147_483_647)
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
      throw new EventStreamFatalError('MESSAGE_PROCESSING_FAILED', error instanceof Error ? error.message : fallback, { cause: error })
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
      code: 'aborted',
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
      code: 'error',
      errorCode: getEventStreamErrorCode(error),
      reason: toCloseReason(error),
      cause: error,
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

function getEventStreamErrorCode(error: unknown): EventStreamErrorCode {
  return getEventStreamFatalCode(error) ?? (error === ERR_TIMEOUT ? 'TIMEOUT' : 'TRANSPORT_ERROR')
}

function cloneHeaders(headers?: Headers): Headers {
  return headers ? new Headers(headers) : new Headers()
}

function createEventStreamRequest(request: HttpRequest, headers: Headers, abort?: AbortSignal): Request {
  const url = resolveRequestUrl(request)
  return new Request(url, createEventStreamRequestInit(request, headers, abort))
}

async function fetchWithSignal(fetchImpl: typeof fetch, request: Request, signal: AbortSignal): Promise<Response> {
  return await awaitWithSignal(() => {
    const pending = Promise.resolve(fetchImpl(request))
    void pending
      .then((response) => {
        if (signal.aborted && response.body) {
          void response.body.cancel(signal.reason).catch(() => undefined)
        }
      })
      .catch(() => undefined)
    return pending
  }, signal)
}

function createOpenInfo(response: Response): EventStreamOpenInfo {
  const openResponse = makeResponse<null>({
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url,
    body: null,
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
  if (!response.ok || response.error !== undefined) {
    throw new EventStreamFatalError('INVALID_RESPONSE', 'Event stream request failed', { cause: response.error })
  }

  const contentType = response.headers.get('content-type') || ''
  if (parseMediaTypeEssence(contentType) !== EVENT_STREAM_CONTENT_TYPE) {
    throw new EventStreamFatalError(
      'INVALID_RESPONSE',
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

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    /* istanbul ignore next -- source-map skew: AbortSignal event handler body mapped to wrong line */
    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(normalizeAbortReason(signal))
    }

    /* istanbul ignore next -- defensive: micro-race where signal aborts before listener is attached */
    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function normalizeAbortError(error: unknown, requestAbort?: AbortSignal, closeAbort?: AbortSignal): unknown {
  const signal = closeAbort?.aborted ? closeAbort : requestAbort?.aborted ? requestAbort : undefined
  if (!signal?.aborted) {
    return error
  }

  return normalizeAbortReason(signal)
}

function normalizeAbortReason(signal: AbortSignal): Error {
  return resolveAbortedTransportError(signal).code === 'TIMEOUT' ? ERR_TIMEOUT : ERR_ABORTED
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
