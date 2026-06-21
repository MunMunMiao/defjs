import type { QueryParamsSerializer } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpProgressFn, HttpRequest, HttpResponseType } from '../internal/http_request'
import type { RequestBuildHandler } from '../internal/request_builder'
import { createBaseTransportRequest } from '../internal/transport_request'
import type { AnyStruct } from '../struct'
import { applyRequestContentType } from './transport/body'

export type ResponseGroupItem<S extends number = number, B extends AnyStruct = AnyStruct> = {
  body: B
  status: S | readonly S[]
}

export type RequestOutputShape = { [key: number]: AnyStruct } | readonly ResponseGroupItem[]

export function createHttpRequest<TInput extends AnyStruct | undefined>(
  method: string,
  path: string,
  input: unknown,
  build: RequestBuildHandler<TInput> | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    downloadProgress?: HttpProgressFn
    input?: TInput
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
  const { built, request } = createBaseTransportRequest(method, path, input, build, {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    context: options.context,
    input: options.input,
    queryParamsSerializer: options.queryParamsSerializer,
    timeout: options.timeout,
    transport: 'http',
    withCredentials: options.withCredentials,
  })

  const httpRequest: HttpRequest = {
    ...request,
    body: built.body,
    bodyContentType: built.bodyContentType,
    bodyContentTypeSource: built.body,
    downloadProgress: options.downloadProgress,
    responseType: options.responseType,
    uploadProgress: options.uploadProgress,
    xsrf: options.xsrf,
  }

  applyRequestContentType(httpRequest, request.headers)
  return httpRequest
}

export function resolveDefaultResponseType(
  output: RequestOutputShape | undefined,
  responseType?: HttpResponseType,
): HttpResponseType | undefined {
  if (responseType) {
    return responseType
  }

  if (!output) {
    return undefined
  }

  return 'json'
}

export function resolveOutputStruct(output: RequestOutputShape, status: number): AnyStruct | undefined {
  if (isResponseOutputMap(output)) {
    return output[status]
  }

  for (let index = output.length - 1; index >= 0; index -= 1) {
    const item = output[index]!
    const statuses = Array.isArray(item.status) ? item.status : [item.status]
    if (statuses.includes(status)) {
      return item.body
    }
  }

  return undefined
}

function isResponseOutputMap(output: RequestOutputShape): output is { [key: number]: AnyStruct } {
  return !Array.isArray(output)
}
