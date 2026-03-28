import type { HttpRequest } from '../../http'
import { detectHttpContentType, serializeHttpBody } from '../../http_utils'
import {
  __makeResponse,
  ERR_ABORTED,
  ERR_INVALID_CLIENT_ENDPOINT,
  ERR_TIMEOUT,
  type HttpResponse,
  type HttpResponseBody,
} from '../../response'
import { __concatChunks, __getContentLength, __getContentType, __parseBody } from './utils'

type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}

export const ERR_STREAMING_REQUEST_UNSUPPORTED = new Error('ERR_STREAMING_REQUEST_UNSUPPORTED')

export function __isReadableStreamBody(
  body: HttpRequest['body'] | ReturnType<typeof serializeHttpBody>,
): body is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream
}

export function __supportsStreamingRequestBody(): boolean {
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

function parseContentLength(headers: Headers): number {
  const value = headers.get('Content-Length')
  if (!value) {
    return 0
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function wrapUploadProgressStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: NonNullable<HttpRequest['uploadProgress']>,
  total: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let loaded = 0

  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      await reader.cancel(reason)
    },
    async pull(controller) {
      const { done, value } = await reader.read()

      if (done) {
        controller.close()
        return
      }

      loaded += value.byteLength
      onProgress({
        lengthComputable: total > 0,
        loaded,
        total,
      })
      controller.enqueue(value)
    },
  })
}

export function __createRequestInit(request: HttpRequest): RequestInitWithDuplex {
  const headers = request.headers ?? new Headers()
  if (!headers.has('Content-Type')) {
    const detectedType = detectHttpContentType(request.body)
    if (detectedType) {
      headers.set('Content-Type', detectedType)
    }
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, text/plain, */*')
  }

  const credentials = request.withCredentials ? 'include' : undefined
  let body = serializeHttpBody(request.body)
  const init: RequestInitWithDuplex = {
    headers,
    method: request.method,
    body,
    signal: request.abort,
    credentials,
  }

  if (__isReadableStreamBody(body)) {
    if (!__supportsStreamingRequestBody()) {
      throw ERR_STREAMING_REQUEST_UNSUPPORTED
    }

    if (request.uploadProgress) {
      body = wrapUploadProgressStream(body, request.uploadProgress, parseContentLength(headers))
      init.body = body
    }

    init.duplex = 'half'
  }

  return init
}

export function __createRequest(request: HttpRequest): Request {
  const url = createRequestUrl(request)

  if (typeof request.queryString === 'string') {
    url.search = request.queryString
  } else if (request.queryParams) {
    url.search = request.queryParams.toString()
  }

  return new Request(url, __createRequestInit(request))
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

export async function fetchHandler(httpRequest: HttpRequest): Promise<HttpResponse<unknown>> {
  const downloadProgress = httpRequest.downloadProgress
  const request = __createRequest(httpRequest)
  const abortSignal = httpRequest.abort
  let response: Response

  try {
    response = await globalThis.fetch(request)
  } catch (error) {
    // Because Safari throws an AbortError instead of a TimeoutError when using AbortSignal.timeout.
    // So when handling an `AbortError`, one needs to determine whether the reason for the abort is a `TimeoutError` or another `AbortError`.
    if (abortSignal?.aborted && abortSignal.reason instanceof Error) {
      switch (true) {
        case abortSignal.reason.name === 'AbortError':
          return __makeResponse({ error: ERR_ABORTED })
        case abortSignal.reason.name === 'TimeoutError':
          return __makeResponse({ error: ERR_TIMEOUT })
      }
    }

    return __makeResponse({ error })
  }

  const { headers, status, statusText, url } = response
  const contentLength = __getContentLength(headers)
  const contentType = __getContentType(headers)
  let body: HttpResponseBody = null

  /* istanbul ignore if -- @preserve */
  if (response.body) {
    const chunks: Uint8Array[] = []
    const reader = response.body.getReader()
    let receivedLength = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      chunks.push(value)
      receivedLength += value.length

      downloadProgress?.({
        lengthComputable: contentLength > 0,
        loaded: receivedLength,
        total: contentLength,
      })
    }

    const chunksAll = __concatChunks(chunks, receivedLength)

    try {
      body = __parseBody({
        request: httpRequest,
        content: chunksAll,
        contentType,
      })
    } catch (error) {
      return __makeResponse({
        error,
        status,
        statusText,
        headers,
        url,
      })
    }
  }

  return __makeResponse({
    status,
    statusText,
    headers,
    url,
    body,
  })
}
