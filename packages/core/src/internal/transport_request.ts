import type { QueryParamsSerializer } from '../client/config'
import { DEFAULT_QUERY_PARAMS_SERIALIZER } from '../client/config'
import { applyRequestContentType } from '../http/transport/body'
import type { AnyStruct } from '../struct'
import type { HttpRequest } from './http_request'
import type { RequestBuildHandler } from './request_builder'
import { buildRequest } from './request_builder'
import { appendRecordToHeaders, createSearchParams, fillUrl } from './url'

type BaseTransport = 'http' | 'sse'

type BaseTransportRequest = HttpRequest & {
  abort: AbortSignal
  baseEndpoint: string
  headers: Headers
  queryParams: URLSearchParams
  queryString: string
}

export type BaseTransportRequestOptions<TInput extends AnyStruct | undefined, TTransport extends BaseTransport> = {
  abort: AbortSignal
  baseEndpoint: string
  defaultHeaders?: Headers
  input?: TInput
  operation?: string
  queryParamsSerializer: QueryParamsSerializer
  timeout?: number
  transport: TTransport
  withCredentials?: boolean
}

export function createBaseTransportRequest<TInput extends AnyStruct | undefined, TTransport extends BaseTransport>(
  method: string,
  path: string,
  input: unknown,
  build: RequestBuildHandler<TInput, TTransport> | undefined,
  options: BaseTransportRequestOptions<TInput, TTransport>,
): BaseTransportRequest {
  const built = buildRequest(input, build, {
    input: options.input,
    transport: options.transport,
  })
  const allowComplexQuery = options.queryParamsSerializer !== DEFAULT_QUERY_PARAMS_SERIALIZER
  const queryParams = createSearchParams(built.query, { allowComplex: allowComplexQuery })
  const headers = options.defaultHeaders ? new Headers(options.defaultHeaders) : new Headers()

  appendRecordToHeaders(headers, built.headers)

  const request: BaseTransportRequest = {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    body: built.body,
    bodyContentType: built.bodyContentType,
    bodyContentTypeSource: built.body,
    endpoint: fillUrl(path, built.params),
    headers,
    method,
    operation: options.operation,
    queryParams,
    queryString: options.queryParamsSerializer(queryParams, built.query),
    timeout: options.timeout,
    withCredentials: options.withCredentials ?? false,
  }

  applyRequestContentType(request, headers)
  return request
}
