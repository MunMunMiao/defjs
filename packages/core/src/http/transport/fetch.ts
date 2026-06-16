import type { FnReturn, NonNullableValue } from '../../internal/utility_types'
import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../internal/http_request'
import type { HttpResponse, HttpResponseBody } from '../../internal/http_response'
import { makeResponse } from '../../internal/http_response'
import { resolveRequestUrl } from '../../internal/url'
import { applyRequestContentType, serializeHttpBody } from './body'
import { concatChunks, getContentLength, getContentType, parseBody } from './utils'

type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}

export const ERR_STREAMING_REQUEST_UNSUPPORTED = new Error('ERR_STREAMING_REQUEST_UNSUPPORTED')

const XSRF_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isReadableStreamBody(body: HttpRequest['body'] | FnReturn<typeof serializeHttpBody>): body is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream
}

let streamingRequestBodySupport: boolean | undefined

export function supportsStreamingRequestBody(): boolean {
  if (streamingRequestBodySupport !== undefined) {
    return streamingRequestBodySupport
  }

  if (typeof Request !== 'function' || typeof ReadableStream === 'undefined') {
    streamingRequestBodySupport = false
    return streamingRequestBodySupport
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

    streamingRequestBodySupport = request.body !== null
    return streamingRequestBodySupport
  } catch {
    streamingRequestBodySupport = false
    return streamingRequestBodySupport
  }
}

export function __resetStreamingRequestBodySupportForTests(): void {
  streamingRequestBodySupport = undefined
}

function isMutatingMethod(method: string): boolean {
  return XSRF_MUTATING_METHODS.has(method.toUpperCase())
}

function isBrowserRuntime(): boolean {
  return typeof document !== 'undefined' && typeof location !== 'undefined'
}

function readBrowserXSRFCookie(name: string): string | undefined {
  try {
    const cookie = document.cookie
    if (cookie === '') {
      return undefined
    }

    for (const part of cookie.split(';')) {
      const [rawName, ...rawValue] = part.trim().split('=')
      if (rawName === name) {
        return decodeURIComponent(rawValue.join('='))
      }
    }
  } catch {
    return undefined
  }

  return undefined
}

function isSameOriginRequest(request: HttpRequest): boolean {
  if (!request.baseEndpoint) {
    return false
  }

  if (!isBrowserRuntime()) {
    return true
  }

  return resolveRequestUrl(request).origin === location.origin
}

function normalizeXSRFToken(token: string | null | undefined): string | undefined {
  if (typeof token !== 'string' || token === '') {
    return undefined
  }

  return token
}

function resolveXSRFToken(request: HttpRequest, xsrf: NonNullableValue<HttpRequest['xsrf']>): string | undefined {
  if (xsrf.tokenProvider) {
    return normalizeXSRFToken(xsrf.tokenProvider({ request }))
  }

  if (!isBrowserRuntime()) {
    return undefined
  }

  return normalizeXSRFToken(readBrowserXSRFCookie(xsrf.cookieName))
}

function applyXSRFHeaderIfNeeded(request: HttpRequest, headers: Headers): void {
  const xsrf = request.xsrf
  if (!xsrf) {
    return
  }

  if (!isMutatingMethod(request.method)) {
    return
  }

  if (headers.has(xsrf.headerName)) {
    return
  }

  if (!isSameOriginRequest(request)) {
    return
  }

  const token = resolveXSRFToken(request, xsrf)
  if (token === undefined) {
    return
  }

  headers.set(xsrf.headerName, token)
}

function wrapUploadProgressStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: NonNullableValue<HttpRequest['uploadProgress']>,
  total: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let loaded = 0

  return new ReadableStream<Uint8Array>({
    cancel(reason) {
      return reader.cancel(reason)
    },
    async pull(controller) {
      try {
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
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

export function createFetchRequestInit(request: HttpRequest): RequestInitWithDuplex {
  const headers = new Headers(request.headers)
  applyRequestContentType(request, headers)
  applyXSRFHeaderIfNeeded(request, headers)

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
      body = wrapUploadProgressStream(body, request.uploadProgress, getContentLength(headers))
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

async function parseNativeResponseBody(response: Response, responseType: HttpRequest['responseType']): Promise<HttpResponseBody> {
  switch (responseType) {
    case 'json': {
      const text = await response.text()
      return text === '' ? null : (JSON.parse(text) as object)
    }
    case 'text':
      return await response.text()
    case 'blob':
      return await response.blob()
    case 'arraybuffer':
      return await response.arrayBuffer()
    default:
      return null
  }
}

export async function fetchHandler(
  httpRequest: HttpRequest,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis) as typeof fetch,
): Promise<HttpResponse<unknown>> {
  const downloadProgress = httpRequest.downloadProgress
  const abortSignal = httpRequest.abort
  let response: Response

  try {
    const request = createFetchRequest(httpRequest)
    response = await fetchImpl(request)
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
    if (downloadProgress) {
      const chunks: Uint8Array[] = []
      const reader = response.body.getReader()
      let receivedLength = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        chunks.push(value)
        receivedLength += value.byteLength

        downloadProgress({
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
    } else {
      try {
        body = await parseNativeResponseBody(response, httpRequest.responseType)
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
  }

  return makeResponse({
    status,
    statusText,
    headers,
    url,
    body,
  })
}
