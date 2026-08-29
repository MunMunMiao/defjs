import type { HttpResponse } from '../internal/http_response'
import type { DefinitionError, HttpStatusError, TransportError } from './types'

/** Shared cause/message sentinel for aborted requests. */
export const ERR_ABORTED = new Error('Request was aborted')

/** Shared cause/message sentinel for timed-out requests. */
export const ERR_TIMEOUT = new Error('Request timed out')

/**
 * Build a `TransportError` from an abort, timeout, or other network cause.
 *
 * @param cause - Underlying abort/timeout/error value.
 * @returns A normalized `TransportError`.
 */
export function createTransportError(cause: unknown): TransportError {
  if (isAbortCause(cause)) {
    const error = new Error(ERR_ABORTED.message, { cause }) as TransportError
    Object.defineProperty(error, 'name', { configurable: true, enumerable: false, value: 'TransportError', writable: true })
    error.code = 'ABORTED'
    error.kind = 'transport'
    return error
  }

  if (isTimeoutCause(cause)) {
    const error = new Error(cause instanceof Error && cause.message ? cause.message : ERR_TIMEOUT.message, { cause }) as TransportError
    Object.defineProperty(error, 'name', { configurable: true, enumerable: false, value: 'TransportError', writable: true })
    error.code = 'TIMEOUT'
    error.kind = 'transport'
    return error
  }

  const error = new Error(cause instanceof Error ? cause.message : 'Network error', { cause }) as TransportError
  Object.defineProperty(error, 'name', { configurable: true, enumerable: false, value: 'TransportError', writable: true })
  error.code = 'NETWORK_ERROR'
  error.kind = 'transport'
  return error
}

/**
 * Build a `DefinitionError` for request/response validation or undeclared status.
 *
 * @param code - Definition error code.
 * @param cause - Underlying validation or status failure.
 * @param response - HTTP response; required for `UNDECLARED_STATUS` (status is taken from it).
 * @returns A normalized `DefinitionError`.
 */
export function createDefinitionError(
  code: 'UNDECLARED_STATUS',
  cause: unknown,
  response: HttpResponse<unknown>,
): Extract<DefinitionError, { code: 'UNDECLARED_STATUS' }>
export function createDefinitionError(
  code: Exclude<DefinitionError['code'], 'UNDECLARED_STATUS'>,
  cause: unknown,
  response?: HttpResponse<unknown>,
): Extract<DefinitionError, { code: Exclude<DefinitionError['code'], 'UNDECLARED_STATUS'> }>
export function createDefinitionError(code: DefinitionError['code'], cause: unknown, response?: HttpResponse<unknown>): DefinitionError {
  if (code === 'UNDECLARED_STATUS') {
    if (!response) {
      throw new TypeError('UNDECLARED_STATUS requires a response')
    }
    const error = new Error(cause instanceof Error ? cause.message : String(cause), { cause }) as Extract<
      DefinitionError,
      { code: 'UNDECLARED_STATUS' }
    >
    Object.defineProperty(error, 'name', { configurable: true, enumerable: false, value: 'DefinitionError', writable: true })
    error.code = code
    error.kind = 'definition'
    error.response = response
    error.status = response.status
    return error
  }

  const error = new Error(cause instanceof Error ? cause.message : String(cause), { cause }) as Extract<
    DefinitionError,
    { code: Exclude<DefinitionError['code'], 'UNDECLARED_STATUS'> }
  >
  Object.defineProperty(error, 'name', { configurable: true, enumerable: false, value: 'DefinitionError', writable: true })
  error.code = code
  error.kind = 'definition'
  error.response = response
  return error
}

/**
 * Build an `HttpStatusError` for a non-success HTTP status.
 *
 * @param status - HTTP status code.
 * @param message - Human-readable error message.
 * @param response - Full HTTP response.
 * @param data - Optional parsed error body.
 * @returns A normalized `HttpStatusError`.
 */
export function createHttpStatusError<TErrorData = unknown, TStatus extends number = number>(
  status: TStatus,
  message: string,
  response: HttpResponse<unknown>,
  data?: TErrorData,
): HttpStatusError<TErrorData, TStatus> {
  const error = new Error(message) as HttpStatusError<TErrorData, TStatus>
  Object.defineProperty(error, 'name', { configurable: true, enumerable: false, value: 'HttpStatusError', writable: true })
  error.code = 'HTTP_STATUS'
  error.data = data as TErrorData
  error.kind = 'http'
  error.response = response
  error.status = status
  return error
}

function isAbortCause(cause: unknown): boolean {
  return cause === ERR_ABORTED || (cause instanceof DOMException && cause.name === 'AbortError')
}

function isTimeoutCause(cause: unknown): boolean {
  return (
    cause === ERR_TIMEOUT ||
    (cause instanceof DOMException && cause.name === 'TimeoutError') ||
    (cause instanceof Error && cause.name === 'TimeoutError')
  )
}
