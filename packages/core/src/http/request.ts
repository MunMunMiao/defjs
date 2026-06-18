import type { QueryParamsSerializer } from '../client/config'
import { DEFAULT_QUERY_PARAMS_SERIALIZER } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpProgressFn, HttpRequest, HttpResponseType } from '../internal/http_request'
import type { RequestBuildHandler } from '../internal/request_builder'
import { buildRequest } from '../internal/request_builder'
import { appendRecordToHeaders, createSearchParams, fillUrl } from '../internal/url'
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
  const built = buildRequest(input, build, {
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
    withCredentials: options.withCredentials ?? false,
    xsrf: options.xsrf,
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
    for (const { status, body } of output) {
      const statuses = Array.isArray(status) ? status : [status]
      for (const code of statuses) {
        map.set(code, body)
      }
    }
    return map
  }

  for (const [status, struct] of Object.entries(output)) {
    map.set(Number(status), struct)
  }

  return map
}
