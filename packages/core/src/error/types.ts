import type { HttpResponse } from '../internal/http_response'

/**
 * Error for an HTTP response whose status is treated as failure.
 */
export interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> extends Error {
  code: 'HTTP_STATUS'
  data: TErrorData
  kind: 'http'
  message: string
  response: HttpResponse<unknown>
  status: TStatus
}

/**
 * Error for transport-level failures such as abort, timeout, or network issues.
 */
export interface TransportError extends Error {
  cause?: unknown
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  kind: 'transport'
  message: string
}

/**
 * Error for definition-time validation or undeclared response status failures.
 */
export type DefinitionError =
  | (Error & {
      cause?: unknown
      code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'INTERCEPTOR_FAILED'
      kind: 'definition'
      response?: HttpResponse<unknown>
    })
  | (Error & {
      cause?: unknown
      code: 'UNDECLARED_STATUS'
      kind: 'definition'
      response: HttpResponse<unknown>
      status: number
    })

/**
 * Union of HTTP status, transport, and definition errors from request execution.
 *
 * @typeParam TErrorData - Declared error body type for `HttpStatusError` variants.
 */
export type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
