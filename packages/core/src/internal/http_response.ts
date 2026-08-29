import type { HttpRequest } from './http_request'
import { resolveRequestUrl } from './url'

const HTTP_RESPONSE: unique symbol = Symbol('HttpResponse')

/**
 * Parsed HTTP response wrapper returned by handlers and `executeHttpCommand`.
 * `ok` is true for status codes in the 2xx range; `error` may hold transport or parse failures.
 */
export type HttpResponse<R> = {
  readonly [HTTP_RESPONSE]: true
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}

/**
 * Fields accepted by `makeResponse` when building a synthetic `HttpResponse` (for example in interceptors).
 */
export type MakeResponseOptions<R> = {
  status?: number
  statusText?: string
  url?: string
  headers?: Headers
  body?: R | null
  error?: unknown
  request?: HttpRequest
}

/**
 * Build an `HttpResponse` value without performing a network call.
 * Useful in interceptors that short-circuit `next`, and in tests.
 *
 * @param options - Status, headers, body, optional request to copy headers/url from, and optional error; defaults yield status `0`.
 * @returns An `HttpResponse` with `ok` derived from the status code.
 */
export function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R> {
  const status = options?.status ?? 0
  const ok = status >= 200 && status < 300
  const statusText = options?.statusText ?? ''
  const url = options?.url ?? requestUrl(options?.request)
  const headers = options?.headers ?? new Headers(options?.request?.headers)
  const body = options?.body ?? null
  let error = options?.error

  if (error === undefined && status === 0) {
    error = new Error(getHttpErrorMessage({ status, statusText, url }))
  }

  return {
    [HTTP_RESPONSE]: true,
    status,
    statusText,
    url,
    headers,
    body,
    error,
    ok,
  }
}

export function getHttpErrorMessage(response: { readonly status: number; readonly statusText: string; readonly url: string }): string {
  let message = `Http failure response: ${response.status}`
  if (response.statusText) {
    message += ` - ${response.statusText}`
  }
  return message
}

function requestUrl(request: HttpRequest | undefined): string {
  if (!request) {
    return ''
  }
  if (!request.baseEndpoint) {
    return request.endpoint
  }
  return resolveRequestUrl(request).href
}
