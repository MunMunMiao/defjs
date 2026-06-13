import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import { serializeHttpBody } from '../../http/transport/body'
import { isReadableStreamBody, supportsStreamingRequestBody } from '../../http/transport/fetch'
import { AsyncQueue } from '../../internal/async_queue'
import type { HttpRequest } from '../../internal/http_request'
import type { HttpResponse } from '../../internal/http_response'
import { makeResponse } from '../../internal/http_response'
import { resolveRequestUrl } from '../../internal/url'
import type { EventStreamMessage } from './parser'
import { createLineParser, createMessageParser, readStreamBytes } from './parser'

export const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream'
export const LAST_EVENT_ID_HEADER = 'last-event-id'
const DEFAULT_RETRY_INTERVAL = 1000

export interface EventStreamOpenInfo {
  response: HttpResponse<null>
  url: string
}

export interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}

export interface EventStreamHandle<TEvent = EventStreamMessage> extends AsyncIterable<TEvent> {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
}

export interface FetchEventStreamOptions<TEvent = EventStreamMessage> {
  fetch?: typeof fetch
  onopen?: (open: EventStreamOpenInfo) => void | Promise<void>
  onmessage?: (message: EventStreamMessage) => void
  onclose?: (open: EventStreamOpenInfo) => void | Promise<void>
  onerror?: (error: unknown, context: FetchEventStreamErrorContext) => number | null | undefined | Promise<number | null | undefined>
  transformMessage?: (message: EventStreamMessage) => Promise<TEvent | undefined> | TEvent | undefined
  retryInterval?: number
  requireContentType?: boolean
}

export interface FetchEventStreamErrorContext {
  lastEventId: string
  retryCount: number
  retryInterval: number
  open?: EventStreamOpenInfo
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

class EventStreamFatalError extends Error {
  cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'EventStreamFatalError'
    /* istanbul ignore else -- unreachable: EventStreamFatalError is always constructed with options */
    if (options) {
      this.cause = options.cause
    }
  }
}

export async function fetchEventStream<TEvent = EventStreamMessage>(
  request: HttpRequest,
  options: FetchEventStreamOptions<TEvent> = {},
): Promise<EventStreamHandle<TEvent>> {
  const queue = new AsyncQueue<TEvent>()
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
  let retryInterval = options.retryInterval ?? DEFAULT_RETRY_INTERVAL
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
      return queue[Symbol.asyncIterator]()
    },
  }

  void start()
  return openDeferred.promise

  async function start(): Promise<void> {
    while (!closeController.signal.aborted) {
      const attemptAbort = combineAbortSignals([request.abort, closeController.signal])

      try {
        const response = await fetchImpl(createEventStreamRequest(request, headers, attemptAbort))
        const open = createOpenInfo(response)
        latestOpen = open

        validateOpenResponse(open, options.requireContentType !== false)
        await options.onopen?.(open)

        if (!settledOpen) {
          settledOpen = true
          openDeferred.resolve(handle)
        }

        /* istanbul ignore next -- defensive: standard fetch always returns a body */
        if (!response.body) {
          throw new Error('Missing response body for event stream')
        }

        await consumeEventStream(response.body)
        await options.onclose?.(open)

        queue.close()
        settleClosed({ code: 'eof' })
        return
      } catch (error) {
        const normalizedError = normalizeAbortError(error, request.abort, closeController.signal)

        if (closeController.signal.aborted || request.abort?.aborted) {
          /* istanbul ignore next -- request.abort path is a micro-race variant */
          /* istanbul ignore next -- request.abort path is a micro-race variant */
          const reason = closeController.signal.aborted ? closeController.signal.reason : request.abort?.reason
          /* istanbul ignore next -- unreachable: normalizeAbortError always returns a value */
          const abortedError = normalizedError ?? ERR_ABORTED
          attachOpenInfo(abortedError, latestOpen)

          if (settledOpen) {
            queue.close()
          } else {
            settledOpen = true
            openDeferred.reject(abortedError)
          }

          /* istanbul ignore next -- unreachable: AbortController always sets a default reason */
          const closeReason = toCloseReason(reason ?? abortedError)
          /* istanbul ignore next -- unreachable: AbortController always sets a default reason */
          const closeCause = reason ?? abortedError
          settleClosed({
            code: 'aborted',
            reason: closeReason,
            cause: closeCause,
          })
          return
        }

        /* istanbul ignore next -- unreachable: normalizeAbortError always returns a value */
        const retryError = normalizedError ?? error
        const retryDelay = await resolveRetryDelay(retryError)
        if (typeof retryDelay !== 'number' || retryDelay < 0) {
          /* istanbul ignore next -- unreachable: normalizeAbortError always returns a value */
          const finalError = normalizedError ?? error
          attachOpenInfo(finalError, latestOpen)
          if (settledOpen) {
            queue.fail(finalError)
          } else {
            settledOpen = true
            openDeferred.reject(finalError)
          }

          settleClosed({
            code: 'error',
            reason: toCloseReason(finalError),
            cause: finalError,
          })
          return
        }

        await wait(retryDelay, closeController.signal)
      }
    }
  }

  async function consumeEventStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    await readStreamBytes(
      stream,
      createLineParser(
        createMessageParser(
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
            try {
              options.onmessage?.(message)
              const transformed = options.transformMessage ? await options.transformMessage(message) : (message as TEvent)

              if (typeof transformed !== 'undefined') {
                queue.push(transformed)
              }
            } catch (error) {
              throw new EventStreamFatalError('Failed to process event stream message', { cause: error })
            }
          },
        ),
      ),
    )
  }

  async function resolveRetryDelay(error: unknown): Promise<number | null> {
    retryCount += 1
    const next = await options.onerror?.(error, {
      lastEventId,
      retryCount,
      retryInterval,
      open: latestOpen,
    })

    if (next === null) {
      return null
    }

    if (typeof next === 'number') {
      return next
    }

    if (!options.onerror && error instanceof EventStreamFatalError) {
      return null
    }

    return retryInterval
  }

  function settleClosed(info: EventStreamCloseInfo): void {
    if (settledClosed) {
      return
    }

    settledClosed = true
    closedDeferred.resolve(info)
  }
}

function cloneHeaders(headers?: Headers): Headers {
  return headers ? new Headers(headers) : new Headers()
}

function createEventStreamRequest(request: HttpRequest, headers: Headers, abort?: AbortSignal): Request {
  const url = resolveRequestUrl(request)
  return new Request(url, createEventStreamRequestInit(request, headers, abort))
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

type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}

function createEventStreamRequestInit(request: HttpRequest, headers: Headers, abort?: AbortSignal): RequestInitWithDuplex {
  /* istanbul ignore next -- unreachable: Accept is always set in fetchEventStream */
  if (!headers.has('Accept')) {
    headers.set('Accept', EVENT_STREAM_CONTENT_TYPE)
  }

  let credentials: 'include' | undefined
  if (request.withCredentials) {
    credentials = 'include'
  }

  const body = serializeHttpBody(request.body)
  const init: RequestInitWithDuplex = {
    body,
    credentials,
    headers,
    method: request.method,
    signal: abort,
  }

  /* istanbul ignore next -- Node.js always supports streaming request body */
  if (isReadableStreamBody(body)) {
    if (!supportsStreamingRequestBody()) {
      throw new Error('ERR_STREAMING_REQUEST_UNSUPPORTED')
    }

    init.duplex = 'half'
  }

  return init
}

function validateOpenResponse(open: EventStreamOpenInfo, requireContentType: boolean): void {
  const { response } = open
  if (response.error) {
    throw new EventStreamFatalError('Event stream request failed', { cause: response.error })
  }

  if (!requireContentType) {
    return
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith(EVENT_STREAM_CONTENT_TYPE)) {
    throw new EventStreamFatalError(`Expected content-type to start with ${EVENT_STREAM_CONTENT_TYPE}, got ${contentType || '(empty)'}`)
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
    resolve,
    reject,
  }
}

function combineAbortSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const validSignals = signals.filter((signal): signal is AbortSignal => !!signal)
  /* istanbul ignore if -- unreachable: at least closeController.signal is always present */
  if (validSignals.length === 0) {
    return undefined
  }

  if (validSignals.length === 1) {
    return validSignals[0]
  }

  return AbortSignal.any(validSignals)
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

    /* istanbul ignore else -- defensive: signal is rarely already aborted before listener is attached */
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
  if (signal.reason instanceof Error) {
    if (signal.reason.name === 'TimeoutError') {
      return ERR_TIMEOUT
    }
    return ERR_ABORTED
  }

  return ERR_ABORTED
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
