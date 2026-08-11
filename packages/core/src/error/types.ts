import type { HttpResponse } from '../internal/http_response'

export interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  code: 'HTTP_STATUS'
  data: TErrorData
  kind: 'http'
  message: string
  response: HttpResponse<unknown>
  status: TStatus
}

export interface TransportError {
  cause?: unknown
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  kind: 'transport'
  message: string
}

export interface DefinitionError {
  cause?: unknown
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  kind: 'definition'
  message: string
  response?: HttpResponse<unknown>
}

export type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
