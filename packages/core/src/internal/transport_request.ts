import type { QueryParamsSerializer } from '../client/config'
import { DEFAULT_QUERY_PARAMS_SERIALIZER } from '../client/config'
import type { AnyStruct } from '../struct'
import type { HttpContext } from './context'
import type { HttpRequest } from './http_request'
import type { RequestBuild, RequestBuildHandler } from './request_builder'
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
  context?: HttpContext
  input?: TInput
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
): { built: RequestBuild; request: BaseTransportRequest } {
  const built = buildRequest(input, build, {
    input: options.input,
    transport: options.transport,
  })
  const allowComplexQuery = options.queryParamsSerializer !== DEFAULT_QUERY_PARAMS_SERIALIZER
  const queryParams = createSearchParams(built.query, { allowComplex: allowComplexQuery })
  const headers = new Headers()

  appendRecordToHeaders(headers, built.headers)

  return {
    built,
    request: {
      abort: options.abort,
      baseEndpoint: options.baseEndpoint,
      context: options.context,
      endpoint: fillUrl(path, built.params),
      headers,
      method,
      queryParams,
      queryString: options.queryParamsSerializer(queryParams, built.query),
      timeout: options.timeout,
      withCredentials: options.withCredentials ?? false,
    },
  }
}
