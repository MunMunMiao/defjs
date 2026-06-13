import type { QueryParamsSerializer } from '../client/config'
import type { HttpRequest } from '../internal/http_request'
import type { RequestBuild, RequestBuilder } from '../internal/request_builder'
import { buildRequest } from '../internal/request_builder'
import type { RequestBuildValue } from '../internal/request_values'
import { createResolvedRequestUrl, resolveRequestUrl } from '../internal/url'
import type { AnyStruct } from '../struct'

export function createWebSocketBuild<TInput>(
  input: TInput,
  build: ((request: RequestBuilder, input: TInput) => void) | undefined,
  inputSchema?: AnyStruct,
): RequestBuild {
  return buildRequest(input, build as ((request: RequestBuilder, input: unknown) => void) | undefined, {
    input: inputSchema,
    transport: 'webSocket',
  })
}

export function createWebSocketRequest(params: {
  abort: AbortSignal
  baseEndpoint: string
  build: RequestBuild
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
    queryParams,
    queryString: params.queryParamsSerializer(queryParams, params.build.query),
    withCredentials: params.withCredentials ?? false,
  }
}

export function createWebSocketUrlFromRequest(request: HttpRequest): string {
  const url = resolveRequestUrl(request)
  url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol
  return url.toString()
}

export function createWebSocketUrl(
  baseEndpoint: string,
  path: string,
  params: Record<string, RequestBuildValue> | undefined,
  query: Record<string, RequestBuildValue> | undefined,
  queryParamsSerializer: QueryParamsSerializer,
): string {
  const url = createResolvedRequestUrl(baseEndpoint, fillUrl(path, params), queryParamsSerializer(createSearchParams(query)))
  url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol
  return url.toString()
}

function fillUrl(path: string, params?: Record<string, RequestBuildValue>): string {
  const paramMap = new Map<string, string>()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'undefined') {
        continue
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          paramMap.set(key, serializeValue(value[0]))
        }
        continue
      }

      paramMap.set(key, serializeValue(value))
    }
  }

  return path.replace(/:([^/]+)/g, (_, part) => paramMap.get(part) ?? 'undefined')
}

function createSearchParams(query?: Record<string, RequestBuildValue>): URLSearchParams {
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
        searchParams.append(key, serializeValue(item))
      }
      continue
    }

    searchParams.set(key, serializeValue(value))
  }

  return searchParams
}

function serializeValue(value: unknown): string {
  switch (true) {
    case typeof value === 'string':
      return value
    case typeof value === 'number':
    case typeof value === 'boolean':
      return String(value)
    case value === null:
      return 'null'
    case typeof value === 'object':
      return JSON.stringify(value)
    default:
      return String(value)
  }
}
