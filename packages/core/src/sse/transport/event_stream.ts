import { ERR_ABORTED, ERR_INVALID_CLIENT_ENDPOINT, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../internal/http_request'
import { type HttpResponse, makeResponse } from '../../internal/http_response'
import { createLineParser, createMessageParser, type EventStreamMessage, readStreamBytes } from './parser'

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

type PendingNext<T> = {
  resolve: (value: IteratorResult<T>) => void
  reject: (reason?: unknown) => void
}

const NO_ERROR = Symbol('NO_ERROR')

class EventStreamFatalError extends Error {
  cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'EventStreamFatalError'
    this.cause = options?.cause
  }
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiting: PendingNext<T>[] = []
  private done = false
  private error: unknown = NO_ERROR

  push(value: T): void {
    if (this.done) {
      return
    }

    const waiting = this.waiting.shift()
    if (waiting) {
      waiting.resolve({ done: false, value })
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

  fail(error: unknown): void {
    if (this.done) {
      return
    }

    this.done = true
    this.error = error
    while (this.waiting.length > 0) {
      this.waiting.shift()?.reject(error)
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

        if (this.error !== NO_ERROR) {
          return Promise.reject(this.error)
        }

        if (this.done) {
          return Promise.resolve({ done: true, value: undefined })
        }

        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiting.push({ resolve, reject })
        })
      },
    }
  }
}

export async function fetchEventStream<TEvent = EventStreamMessage>(
  request: HttpRequest,
  options: FetchEventStreamOptions<TEvent> = {},
): Promise<EventStreamHandle<TEvent>> {
  const queue = new AsyncEventQueue<TEvent>()
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
          const reason = closeController.signal.aborted ? closeController.signal.reason : request.abort?.reason
          const abortedError = normalizedError ?? ERR_ABORTED
          attachOpenInfo(abortedError, latestOpen)

          if (settledOpen) {
            queue.close()
          } else {
            settledOpen = true
            openDeferred.reject(abortedError)
          }

          settleClosed({
            code: 'aborted',
            reason: toCloseReason(reason ?? abortedError),
            cause: reason ?? abortedError,
          })
          return
        }

        const retryDelay = await resolveRetryDelay(normalizedError ?? error)
        if (typeof retryDelay !== 'number' || retryDelay < 0) {
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
          id => {
            lastEventId = id
            if (id) {
              headers.set(LAST_EVENT_ID_HEADER, id)
            } else {
              headers.delete(LAST_EVENT_ID_HEADER)
            }
          },
          retry => {
            retryInterval = retry
          },
          async message => {
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
  const url = createRequestUrl(request)
  if (typeof request.queryString === 'string') {
    url.search = request.queryString
  } else if (request.queryParams) {
    url.search = request.queryParams.toString()
  }

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
  if (!headers.has('Accept')) {
    headers.set('Accept', EVENT_STREAM_CONTENT_TYPE)
  }

  const credentials = request.withCredentials ? 'include' : undefined
  const body = serializeEventStreamBody(request.body)
  const init: RequestInitWithDuplex = {
    body,
    credentials,
    headers,
    method: request.method,
    signal: abort,
  }

  if (isReadableStreamBody(body)) {
    if (!supportsStreamingRequestBody()) {
      throw new Error('ERR_STREAMING_REQUEST_UNSUPPORTED')
    }

    init.duplex = 'half'
  }

  return init
}

function createRequestUrl(request: HttpRequest): URL {
  if (!request.baseEndpoint) {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }

  let base: URL
  try {
    base = new URL(request.baseEndpoint)
  } catch {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }

  if (!base.pathname.endsWith('/')) {
    base.pathname = `${base.pathname}/`
  }

  try {
    return new URL(request.endpoint.replace(/^\/+/, ''), base)
  } catch {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }
}

function serializeEventStreamBody(
  body: HttpRequest['body'],
): ArrayBuffer | Blob | FormData | URLSearchParams | ReadableStream<Uint8Array> | string | null {
  switch (true) {
    case body instanceof FormData:
    case body instanceof Blob:
    case body instanceof ArrayBuffer:
    case body instanceof URLSearchParams:
    case typeof ReadableStream !== 'undefined' && body instanceof ReadableStream:
    case typeof body === 'string':
      return body
    case typeof body === 'object':
    case typeof body === 'boolean':
    case typeof body === 'number':
    case Array.isArray(body):
      return JSON.stringify(body)
    default:
      return null
  }
}

function isReadableStreamBody(body: HttpRequest['body'] | ReturnType<typeof serializeEventStreamBody>): body is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream
}

function supportsStreamingRequestBody(): boolean {
  if (typeof Request !== 'function' || typeof ReadableStream === 'undefined') {
    return false
  }

  try {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    const request = new Request('https://example.com', {
      body: stream,
      duplex: 'half',
      method: 'POST',
    } as RequestInitWithDuplex)

    return request.body !== null
  } catch {
    return false
  }
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

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(normalizeAbortReason(signal))
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
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
    switch (signal.reason.name) {
      case 'TimeoutError':
        return ERR_TIMEOUT
      case 'AbortError':
      default:
        return ERR_ABORTED
    }
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
