import type { QueryParamsSerializer } from '../client/config'
import { DEFAULT_QUERY_PARAMS_SERIALIZER } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpProgressFn, HttpRequest, HttpResponseType } from '../internal/http_request'
import type { RequestBuilder } from '../internal/request_builder'
import { buildRequest } from '../internal/request_builder'
import { appendRecordToHeaders, createSearchParams, fillUrl } from '../internal/url'
import type { AnyStruct } from '../struct'
import { applyRequestContentType } from './transport/body'

export type ResponseGroupItem<S extends number = number, B extends AnyStruct = AnyStruct> = {
  body: B
  status: S | readonly S[]
}

export type RequestOutputShape = Record<number, AnyStruct> | readonly ResponseGroupItem[]

export function createHttpRequest<TInput>(
  method: string,
  path: string,
  input: TInput,
  build: ((request: RequestBuilder, input: TInput) => void) | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    downloadProgress?: HttpProgressFn
    input?: AnyStruct
    queryParamsSerializer: QueryParamsSerializer
    responseType?: HttpResponseType
    timeout?: number
    uploadProgress?: HttpProgressFn
    withCredentials?: boolean
  },
): HttpRequest {
  const built = buildRequest(input, build as ((request: RequestBuilder, input: unknown) => void) | undefined, {
    input: options.input,
    transport: 'http',
  })
  const allowComplexQuery = options.queryParamsSerializer !== DEFAULT_QUERY_PARAMS_SERIALIZER
  const queryParams = createSearchParams(built.query, { allowComplex: allowComplexQuery })
  const headers = new Headers()

  appendRecordToHeaders(headers, built.headers)

  const request: HttpRequest = {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    body: built.body,
    bodyContentType: built.bodyContentType,
    bodyContentTypeSource: built.body,
    context: options.context,
    downloadProgress: options.downloadProgress,
    endpoint: fillUrl(path, built.params),
    headers,
    method,
    queryParams,
    queryString: options.queryParamsSerializer(queryParams, built.query),
    responseType: options.responseType,
    timeout: options.timeout,
    uploadProgress: options.uploadProgress,
    withCredentials: built.withCredentials ?? options.withCredentials ?? false,
  }

  applyRequestContentType(request, headers)
  return request
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

export function normalizeOutputShape(output: RequestOutputShape): Map<number, AnyStruct> {
  const map = new Map<number, AnyStruct>()

  if (Array.isArray(output)) {
    for (const item of output) {
      const statuses = Array.isArray(item.status) ? item.status : [item.status]
      for (const status of statuses) {
        map.set(status, item.body)
      }
    }
    return map
  }

  for (const [status, struct] of Object.entries(output)) {
    map.set(Number(status), struct)
  }

  return map
}
