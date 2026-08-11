import type { HttpResponse } from '../internal/http_response'
import type { DefinitionError, HttpStatusError, TransportError } from './types'

export const ERR_ABORTED = new Error('Request was aborted')
export const ERR_TIMEOUT = new Error('Request timed out')

export function createTransportError(cause: unknown): TransportError {
  if (isAbortCause(cause)) {
    return {
      cause,
      code: 'ABORTED',
      kind: 'transport',
      message: ERR_ABORTED.message,
    }
  }

  if (isTimeoutCause(cause)) {
    return {
      cause,
      code: 'TIMEOUT',
      kind: 'transport',
      message: cause instanceof Error && cause.message ? cause.message : ERR_TIMEOUT.message,
    }
  }

  return {
    cause,
    code: 'NETWORK_ERROR',
    kind: 'transport',
    message: cause instanceof Error ? cause.message : 'Network error',
  }
}

export function createDefinitionError(code: DefinitionError['code'], cause: unknown, response?: HttpResponse<unknown>): DefinitionError {
  return {
    cause,
    code,
    kind: 'definition',
    message: cause instanceof Error ? cause.message : String(cause),
    response,
  }
}

export function createHttpStatusError<TErrorData = unknown, TStatus extends number = number>(
  status: TStatus,
  message: string,
  response: HttpResponse<unknown>,
  data?: TErrorData,
): HttpStatusError<TErrorData, TStatus> {
  return {
    code: 'HTTP_STATUS',
    data: data as TErrorData,
    kind: 'http',
    message,
    response,
    status,
  }
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
