import type { QueryParamsSerializer } from '../client/config'
import { DEFAULT_QUERY_PARAMS_SERIALIZER } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpRequest } from '../internal/http_request'
import type { RequestBuilder } from '../internal/request_builder'
import { buildRequest } from '../internal/request_builder'
import { appendRecordToHeaders, createSearchParams, fillUrl } from '../internal/url'
import type { AnyStruct } from '../struct'

export function createEventStreamRequest<TInput>(
  method: string,
  path: string,
  input: TInput,
  build: ((request: RequestBuilder, input: TInput) => void) | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    input?: AnyStruct
    queryParamsSerializer: QueryParamsSerializer
    timeout?: number
    withCredentials?: boolean
  },
): HttpRequest {
  const built = buildRequest(input, build as ((request: RequestBuilder, input: unknown) => void) | undefined, {
    input: options.input,
    transport: 'sse',
  })
  const allowComplexQuery = options.queryParamsSerializer !== DEFAULT_QUERY_PARAMS_SERIALIZER
  const queryParams = createSearchParams(built.query, { allowComplex: allowComplexQuery })
  const headers = new Headers()

  appendRecordToHeaders(headers, built.headers)

  if (built.bodyContentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', built.bodyContentType)
  }

  return {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    body: built.body,
    context: options.context,
    endpoint: fillUrl(path, built.params),
    headers,
    method,
    queryParams,
    queryString: options.queryParamsSerializer(queryParams, built.query),
    timeout: options.timeout,
    withCredentials: built.withCredentials ?? options.withCredentials ?? false,
  }
}
