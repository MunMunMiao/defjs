import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../internal/http_request'
import { type HttpResponse, type HttpResponseBody, makeResponse } from '../../internal/http_response'
import { resolveRequestUrl } from '../../internal/url'
import { applyRequestContentType, serializeHttpBody } from './body'
import { concatChunks, getContentLength, getContentType, parseBody } from './utils'

type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}

export const ERR_STREAMING_REQUEST_UNSUPPORTED = new Error('ERR_STREAMING_REQUEST_UNSUPPORTED')

export function isReadableStreamBody(body: HttpRequest['body'] | ReturnType<typeof serializeHttpBody>): body is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream
}

export function supportsStreamingRequestBody(): boolean {
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

export function createFetchRequestInit(request: HttpRequest): RequestInitWithDuplex {
  const headers = new Headers(request.headers)
  applyRequestContentType(request, headers)

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

  if (isReadableStreamBody(body)) {
    if (!supportsStreamingRequestBody()) {
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

export function createFetchRequest(request: HttpRequest): Request {
  const url = resolveRequestUrl(request)
  return new Request(url, createFetchRequestInit(request))
}

export async function fetchHandler(httpRequest: HttpRequest): Promise<HttpResponse<unknown>> {
  const downloadProgress = httpRequest.downloadProgress
  const request = createFetchRequest(httpRequest)
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
          return makeResponse({ error: ERR_ABORTED })
        case abortSignal.reason.name === 'TimeoutError':
          return makeResponse({ error: ERR_TIMEOUT })
      }
    }

    return makeResponse({ error })
  }

  const { headers, status, statusText, url } = response
  const contentLength = getContentLength(headers)
  const contentType = getContentType(headers)
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

    const chunksAll = concatChunks(chunks, receivedLength)

    try {
      body = parseBody({
        request: httpRequest,
        content: chunksAll,
        contentType,
      })
    } catch (error) {
      return makeResponse({
        error,
        status,
        statusText,
        headers,
        url,
      })
    }
  }

  return makeResponse({
    status,
    statusText,
    headers,
    url,
    body,
  })
}
