import type { QueryParamsSerializer } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpRequest } from '../internal/http_request'
import { buildRequest, type RequestBuildHandler } from '../internal/request_builder'
import { appendRecordToHeaders, createSearchParams, fillUrl } from '../internal/url'

export function createEventStreamRequest<TInput>(
  method: string,
  path: string,
  input: TInput,
  build: RequestBuildHandler<TInput> | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    queryParamsSerializer: QueryParamsSerializer
    timeout?: number
    withCredentials?: boolean
  },
): HttpRequest {
  const built = buildRequest(input, build)
  const queryParams = createSearchParams(built.query)
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
    queryString: options.queryParamsSerializer(queryParams),
    timeout: options.timeout,
    withCredentials: built.withCredentials ?? options.withCredentials ?? false,
  }
}
