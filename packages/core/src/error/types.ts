import type { DefjsErrorCode } from './codes'

export class DefjsError extends Error {
  readonly code: DefjsErrorCode
  constructor(code: DefjsErrorCode) {
    super(code)
    this.code = code
  }
}

export interface SettledResponseLike<TBody = unknown> {
  body: TBody | null
  error?: unknown
  headers: Headers
  ok: boolean
  status: number
  statusText: string
  url: string
}

export interface HttpStatusError<TErrorData = unknown> {
  data: TErrorData
  kind: 'http'
  message: string
  response: SettledResponseLike<unknown>
  status: number
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
  response?: SettledResponseLike<unknown>
}

export type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
