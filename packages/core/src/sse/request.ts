import type { QueryParamsSerializer } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpRequest } from '../internal/http_request'
import type { RequestBuildHandler } from '../internal/request_builder'
import { createBaseTransportRequest } from '../internal/transport_request'
import type { AnyStruct } from '../struct'

export function createEventStreamRequest<TInput extends AnyStruct | undefined>(
  method: string,
  path: string,
  input: unknown,
  build: RequestBuildHandler<TInput, 'sse'> | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    input?: TInput
    operation?: string
    queryParamsSerializer: QueryParamsSerializer
    timeout?: number
    withCredentials?: boolean
  },
): HttpRequest {
  return createBaseTransportRequest(method, path, input, build, {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    context: options.context,
    input: options.input,
    operation: options.operation,
    queryParamsSerializer: options.queryParamsSerializer,
    timeout: options.timeout,
    transport: 'sse',
    withCredentials: options.withCredentials,
  }).request
}
