import type { FetchHandle } from '../../client/config'
import { awaitWithSignal, resolveAbortTransportError } from '../../internal/abort'
import type { HttpProgressFn, HttpRequest } from '../../internal/http_request'
import type { HttpResponse } from '../../internal/http_response'
import { makeResponse } from '../../internal/http_response'
import { resolveRequestUrl } from '../../internal/url'
import { applyRequestContentType } from './body'
import {
  __resetStreamingRequestBodySupportForTests,
  createFetchInitBase,
  ERR_STREAMING_REQUEST_UNSUPPORTED,
  isReadableStreamBody,
  supportsStreamingRequestBody,
} from './fetch_init'
import { concatChunks, getContentLength, getContentType, parseBytesBody } from './utils'

export { __resetStreamingRequestBodySupportForTests, ERR_STREAMING_REQUEST_UNSUPPORTED, isReadableStreamBody, supportsStreamingRequestBody }

const XSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

function isSafeMethod(method: string): boolean {
  return XSRF_SAFE_METHODS.has(method.toUpperCase())
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

function resolveXSRFToken(
  request: HttpRequest,
  xsrf: {
    cookieName: string
    headerName: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  },
): string | undefined {
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

  if (isSafeMethod(request.method)) {
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
  onProgress: HttpProgressFn,
  total: number,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let cleanedUp = false
  let loaded = 0
  const onAbort = () => cleanup(true, signal?.reason)

  function cleanup(cancel: boolean, reason?: unknown): void {
    if (cleanedUp) {
      return
    }

    cleanedUp = true
    signal?.removeEventListener('abort', onAbort)
    try {
      if (cancel) {
        void reader.cancel(reason).catch(() => undefined)
      }
    } finally {
      reader.releaseLock()
    }
  }

  const wrapped = new ReadableStream<Uint8Array>({
    cancel(reason) {
      cleanup(true, reason)
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read()

        if (cleanedUp) {
          return
        }

        if (done) {
          cleanup(false)
          controller.close()
          return
        }

        loaded += value.byteLength
        const event = { lengthComputable: total > 0, loaded, total }
        await (signal ? awaitWithSignal(() => onProgress(event), signal) : onProgress(event))
        if (cleanedUp) {
          return
        }
        controller.enqueue(value)
      } catch (error) {
        cleanup(true, error)
        controller.error(error)
      }
    },
  })

  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
  }

  return wrapped
}

function cancelWrappedUploadBody(request: HttpRequest, body: unknown, reason: unknown): void {
  if (request.uploadProgress && isReadableStreamBody(request.body) && isReadableStreamBody(body)) {
    void body.cancel(reason).catch(() => undefined)
  }
}

async function fetchWithSignal(fetchImpl: FetchHandle, request: Request, signal: AbortSignal | undefined): Promise<Response> {
  if (!signal) {
    return await fetchImpl(request)
  }

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

export function createFetchRequestInit(request: HttpRequest): RequestInit & { duplex?: 'half' } {
  const headers = new Headers(request.headers)
  const uploadProgress = request.uploadProgress
  applyRequestContentType(request, headers)
  applyXSRFHeaderIfNeeded(request, headers)

  return createFetchInitBase(request, {
    defaultAccept: 'application/json, text/plain, */*',
    headers,
    signal: request.abort,
    streamingRequestUnsupportedError: ERR_STREAMING_REQUEST_UNSUPPORTED,
    wrapReadableStreamBody: uploadProgress
      ? (body) => wrapUploadProgressStream(body, uploadProgress, getContentLength(headers), request.abort)
      : undefined,
  })
}

export function createFetchRequest(request: HttpRequest): Request {
  const url = resolveRequestUrl(request)
  const init = createFetchRequestInit(request)

  try {
    return new Request(url, init)
  } catch (error) {
    cancelWrappedUploadBody(request, init.body, error)
    throw error
  }
}

async function parseFetchResponse(httpRequest: HttpRequest, response: Response, fallbackUrl: string): Promise<HttpResponse<unknown>> {
  const downloadProgress = httpRequest.downloadProgress
  const { headers, status, statusText } = response
  const url = response.url || fallbackUrl

  if (response.body && httpRequest.responseType === undefined) {
    void response.body.cancel().catch(() => undefined)
    return makeResponse({ status, statusText, headers, url, body: null })
  }

  const contentLength = getContentLength(headers)
  const contentType = getContentType(headers)
  let body: unknown = null

  if (response.body) {
    const chunks: Uint8Array[] = []
    const reader = response.body.getReader()
    const signal = httpRequest.abort
    let receivedLength = 0

    try {
      while (true) {
        const result = signal ? await awaitWithSignal(() => reader.read(), signal) : await reader.read()
        if (result.done) {
          break
        }

        chunks.push(result.value)
        receivedLength += result.value.byteLength

        if (downloadProgress) {
          const event = { lengthComputable: contentLength > 0, loaded: receivedLength, total: contentLength }
          await (signal ? awaitWithSignal(() => downloadProgress(event), signal) : downloadProgress(event))
        }
      }
    } catch (error) {
      void reader.cancel(error).catch(() => undefined)
      if (downloadProgress || signal?.aborted) {
        throw error
      }
      return makeResponse({ error, status, statusText, headers, url })
    } finally {
      reader.releaseLock()
    }

    try {
      body = parseBytesBody(httpRequest.responseType, concatChunks(chunks, receivedLength), contentType)
    } catch (error) {
      return makeResponse({ error, status, statusText, headers, url })
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

/**
 * Default HTTP transport: perform `httpRequest` with `fetch` and return an `HttpResponse`.
 * Used by the client unless `withHTTPHandle` replaces it; also usable in tests and custom handlers.
 *
 * @param httpRequest - Normalized request (URL, headers, body, abort, progress hooks).
 * @param fetchImpl - Fetch implementation; defaults to global `fetch`.
 * @returns Parsed `HttpResponse`, or a status-0 response when the network/abort fails.
 */
export async function fetchHandler(
  httpRequest: HttpRequest,
  fetchImpl: FetchHandle = globalThis.fetch.bind(globalThis),
): Promise<HttpResponse<unknown>> {
  const abortSignal = httpRequest.abort
  let prepared = httpRequest
  let request: Request | undefined
  let response: Response

  try {
    prepared = await prepareUploadProgressRequest(httpRequest)
    request = createFetchRequest(prepared)
    response = await fetchWithSignal(fetchImpl, request, abortSignal)
  } catch (error) {
    cancelWrappedUploadBody(prepared, request?.body, error)
    return makeResponse({ error: (abortSignal && resolveAbortTransportError(abortSignal)?.cause) ?? error })
  }

  try {
    return await parseFetchResponse(httpRequest, response, request.url)
  } catch (error) {
    const transportError = abortSignal && resolveAbortTransportError(abortSignal)
    if (transportError) {
      return makeResponse({ error: transportError.cause })
    }
    throw error
  }
}

async function prepareUploadProgressRequest(request: HttpRequest): Promise<HttpRequest> {
  const { uploadProgress, body } = request
  if (!uploadProgress || body == null || isReadableStreamBody(body) || !supportsStreamingRequestBody()) {
    return request
  }

  const converted = await convertBodyToUploadStream(body)
  if (!converted) {
    return request
  }

  const headers = new Headers(request.headers)
  if (converted.contentType) {
    headers.set('Content-Type', converted.contentType)
  }
  if (converted.total > 0) {
    headers.set('Content-Length', String(converted.total))
  }

  const startEvent = { lengthComputable: converted.total > 0, loaded: 0, total: converted.total }
  try {
    if (request.abort) {
      await awaitWithSignal(() => uploadProgress(startEvent), request.abort)
    } else {
      await uploadProgress(startEvent)
    }
  } catch (error) {
    void converted.stream.cancel(error)
    throw error
  }

  return {
    ...request,
    body: converted.stream,
    bodyContentType: converted.contentType ?? request.bodyContentType,
    bodyContentTypeSource: converted.stream,
    headers,
  }
}

async function convertBodyToUploadStream(
  body: HttpRequest['body'],
): Promise<{ contentType?: string | null; stream: ReadableStream<Uint8Array>; total: number } | undefined> {
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { contentType: body.type || undefined, stream: body.stream(), total: body.size }
  }

  if (body instanceof ArrayBuffer) {
    return {
      contentType: 'application/octet-stream',
      stream: new Blob([body]).stream(),
      total: body.byteLength,
    }
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const serialized = new Response(body)
    const blob = await serialized.blob()
    return { contentType: serialized.headers.get('Content-Type'), stream: blob.stream(), total: blob.size }
  }

  return undefined
}
