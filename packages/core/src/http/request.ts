import type { QueryParamsSerializer } from '../client/config'
import type { HttpProgressFn, HttpRequest, HttpResponseType } from '../internal/http_request'
import type { RequestBuildHandler } from '../internal/request_builder'
import { createBaseTransportRequest } from '../internal/transport_request'
import type { AnyStruct } from '../struct'

export function createHttpRequest<TInput extends AnyStruct | undefined>(
  method: string,
  path: string,
  input: unknown,
  build: RequestBuildHandler<TInput> | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    defaultHeaders?: Headers
    downloadProgress?: HttpProgressFn
    input?: TInput
    operation?: string
    queryParamsSerializer: QueryParamsSerializer
    responseType?: HttpResponseType
    timeout?: number
    uploadProgress?: HttpProgressFn
    withCredentials?: boolean
    xsrf?: {
      cookieName: string
      headerName: string
      tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
    }
  },
): HttpRequest {
  const request = createBaseTransportRequest(method, path, input, build, {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    defaultHeaders: options.defaultHeaders,
    input: options.input,
    operation: options.operation,
    queryParamsSerializer: options.queryParamsSerializer,
    timeout: options.timeout,
    transport: 'http',
    withCredentials: options.withCredentials,
  })

  return {
    ...request,
    downloadProgress: options.downloadProgress,
    responseType: options.responseType,
    uploadProgress: options.uploadProgress,
    xsrf: options.xsrf,
  }
}

/**
 * Pick the representation the transport should read the body as.
 *
 * Declaring either `output` or `error` means something will be decoded, and JSON is the
 * default representation. Declaring neither leaves the body unread.
 *
 * @param hasDeclaration - Whether the endpoint declared `output` or `error`.
 * @param responseType - Explicit representation from the definition, when given.
 * @returns The representation to read, or `undefined` to skip the body entirely.
 */
export function resolveDefaultResponseType(hasDeclaration: boolean, responseType?: HttpResponseType): HttpResponseType | undefined {
  if (responseType) {
    return responseType
  }

  return hasDeclaration ? 'json' : undefined
}
