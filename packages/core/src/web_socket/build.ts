import type { QueryParamsSerializer } from '../client/config'
import type { HttpRequest } from '../internal/http_request'
import type { RequestBuild, RequestBuildHandler } from '../internal/request_builder'
import { buildRequest } from '../internal/request_builder'
import type { RequestBuildValue } from '../internal/request_values'
import { isRequestScalarValue, serializeRequestScalarValue } from '../internal/request_values'
import { fillUrl, resolveRequestUrl } from '../internal/url'
import type { AnyStruct } from '../struct'

export function createWebSocketBuild<TInput extends AnyStruct | undefined>(
  input: unknown,
  build: RequestBuildHandler<TInput, 'webSocket'> | undefined,
  inputStruct?: TInput,
): RequestBuild {
  return buildRequest(input, build, {
    input: inputStruct,
    transport: 'webSocket',
  })
}

export function createWebSocketRequest(params: {
  abort: AbortSignal
  baseEndpoint: string
  build: RequestBuild
  operation?: string
  path: string
  queryParamsSerializer: QueryParamsSerializer
  withCredentials?: boolean
}): HttpRequest {
  const queryParams = createSearchParams(params.build.query)
  return {
    abort: params.abort,
    baseEndpoint: params.baseEndpoint,
    endpoint: fillUrl(params.path, params.build.params),
    headers: new Headers(),
    method: 'GET',
    operation: params.operation,
    queryParams,
    queryString: params.queryParamsSerializer(queryParams, params.build.query),
    withCredentials: params.withCredentials ?? false,
  }
}

export function createWebSocketUrlFromRequest(request: HttpRequest): string {
  const url = resolveRequestUrl(request)
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  return url.toString()
}

// WebSocket-specific search params builder that serializes complex values (objects → JSON, bigint → string).
// Differs from internal/url's createSearchParams which silently skips non-scalar values.
function createSearchParams(query?: { [key: string]: RequestBuildValue }): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (!query) {
    return searchParams
  }

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'undefined') {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, serializeWebSocketQueryValue(item))
      }
      continue
    }

    searchParams.set(key, serializeWebSocketQueryValue(value))
  }

  return searchParams
}

function serializeWebSocketQueryValue(value: unknown): string {
  if (isRequestScalarValue(value)) {
    return serializeRequestScalarValue(value)
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}
