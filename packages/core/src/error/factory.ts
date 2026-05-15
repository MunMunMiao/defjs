import {
  CODE_ABORTED,
  CODE_INVALID_CLIENT,
  CODE_INVALID_CLIENT_ENDPOINT,
  CODE_INVALID_HTTP_CONTEXT_TOKEN,
  CODE_NETWORK,
  CODE_NOT_FOUND_GLOBAL_CLIENT,
  CODE_NOT_FOUND_HANDLER,
  CODE_OBSERVE,
  CODE_TIMEOUT,
  CODE_UNKNOWN,
  CODE_UNSUPPORTED_FIELD_TYPE,
} from './codes'
import { hasErrorCode } from './normalize'
import { unwrapErrorCause } from './protocol'
import { type DefinitionError, DefjsError, type RequestError, type SettledResponseLike, type TransportError } from './types'

export const ERR_ABORTED = new DefjsError(CODE_ABORTED)
export const ERR_TIMEOUT = new DefjsError(CODE_TIMEOUT)
export const ERR_NETWORK = new DefjsError(CODE_NETWORK)
export const ERR_NOT_FOUND_HANDLER = new DefjsError(CODE_NOT_FOUND_HANDLER)
export const ERR_OBSERVE = new DefjsError(CODE_OBSERVE)
export const ERR_UNSUPPORTED_FIELD_TYPE = new DefjsError(CODE_UNSUPPORTED_FIELD_TYPE)
export const ERR_INVALID_CLIENT = new DefjsError(CODE_INVALID_CLIENT)
export const ERR_INVALID_CLIENT_ENDPOINT = new DefjsError(CODE_INVALID_CLIENT_ENDPOINT)
export const ERR_NOT_FOUND_GLOBAL_CLIENT = new DefjsError(CODE_NOT_FOUND_GLOBAL_CLIENT)
export const ERR_INVALID_HTTP_CONTEXT_TOKEN = new DefjsError(CODE_INVALID_HTTP_CONTEXT_TOKEN)
export const ERR_UNKNOWN = new DefjsError(CODE_UNKNOWN)

export function createTransportError(cause: unknown): TransportError {
  if (hasErrorCode(cause, CODE_ABORTED)) {
    return {
      cause,
      code: 'ABORTED',
      kind: 'transport',
      message: CODE_ABORTED,
    }
  }

  if (hasErrorCode(cause, CODE_TIMEOUT)) {
    return {
      cause,
      code: 'TIMEOUT',
      kind: 'transport',
      message: CODE_TIMEOUT,
    }
  }

  return {
    cause,
    code: 'NETWORK_ERROR',
    kind: 'transport',
    message: cause instanceof Error ? cause.message : CODE_NETWORK,
  }
}

export function createDefinitionError(
  code: DefinitionError['code'],
  cause: unknown,
  response?: SettledResponseLike<unknown>,
): DefinitionError {
  return {
    cause,
    code,
    kind: 'definition',
    message: cause instanceof Error ? cause.message : String(cause),
    response,
  }
}

function isSchemaErrorLike(value: unknown): value is Error & { issues: readonly unknown[] } {
  return value instanceof Error && value.name === 'SchemaError' && Array.isArray((value as { issues?: unknown[] }).issues)
}

export function createRequestRuntimeError(cause: unknown, response?: SettledResponseLike<unknown>): RequestError<unknown> {
  const rootCause = unwrapErrorCause(cause)

  if (response && !response.ok) {
    return {
      code: 'HTTP_STATUS',
      data: undefined,
      kind: 'http',
      message: response.error instanceof Error
        ? response.error.message
        /* istanbul ignore next -- unreachable: fetchHandler always sets response.error to an Error */
        : String(response.error ?? `HTTP ${response.status}`),
      response,
      status: response.status,
    }
  }

  if (isSchemaErrorLike(rootCause)) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', rootCause, response)
  }

  if (rootCause instanceof Error && /Expected content-type/.test(rootCause.message)) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', rootCause, response)
  }

  return createTransportError(rootCause)
}
