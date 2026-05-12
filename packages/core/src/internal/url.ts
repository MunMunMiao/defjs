import { ERR_INVALID_CLIENT_ENDPOINT } from '../error'
import type { HttpRequest } from './http_request'
import type { RequestBuildValue } from './request_values'

export function fillUrl(path: string, params?: Record<string, RequestBuildValue>): string {
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

export function createSearchParams(query?: Record<string, RequestBuildValue>): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (!query) {
    return searchParams
  }

  for (const [key, value] of Object.entries(query)) {
    appendToSearchParams(searchParams, key, value)
  }

  return searchParams
}

export function appendRecordToHeaders(headers: Headers, value?: HeadersInit | Record<string, RequestBuildValue>): void {
  if (!value) {
    return
  }

  if (value instanceof Headers) {
    value.forEach((headerValue, key) => {
      headers.set(key, headerValue)
    })
    return
  }

  if (Array.isArray(value)) {
    for (const [key, headerValue] of value) {
      headers.append(key, headerValue)
    }
    return
  }

  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === 'undefined') {
      continue
    }

    if (Array.isArray(headerValue)) {
      for (const item of headerValue) {
        headers.append(key, serializeValue(item))
      }
      continue
    }

    headers.set(key, serializeValue(headerValue))
  }
}

export function createResolvedRequestUrl(baseEndpoint: string, path: string, queryString = ''): URL {
  const base = createEndpointDirectoryBase(baseEndpoint)
  const normalizedPath = normalizeEndpointPath(path)
  const url = new URL(normalizedPath, base)
  url.search = queryString
  return url
}

// HttpRequest-flavored convenience: resolve endpoint + base + query string in one go.
// Replaces the four near-identical `createRequestUrl` helpers previously duplicated in fetch/xhr/sse/test_handler.
export function resolveRequestUrl(request: HttpRequest): URL {
  if (!request.baseEndpoint) {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }
  const queryString =
    typeof request.queryString === 'string'
      ? request.queryString
      : request.queryParams
        ? request.queryParams.toString()
        : ''
  return createResolvedRequestUrl(request.baseEndpoint, request.endpoint, queryString)
}

function appendToSearchParams(searchParams: URLSearchParams, key: string, value: RequestBuildValue): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, serializeValue(item))
    }
    return
  }

  searchParams.set(key, serializeValue(value))
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

function createEndpointDirectoryBase(baseEndpoint: string): URL {
  let base: URL
  try {
    base = new URL(baseEndpoint)
  } catch {
    throw ERR_INVALID_CLIENT_ENDPOINT
  }

  base.search = ''
  base.hash = ''

  if (!base.pathname.endsWith('/')) {
    base.pathname = `${base.pathname}/`
  }

  return base
}

function normalizeEndpointPath(path: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path) || path.startsWith('//')) {
    throw new Error('Endpoint path must not be an absolute URL')
  }

  if (path.includes('?') || path.includes('#')) {
    throw new Error('Endpoint path must not include query or hash')
  }

  return path.replace(/^\/+/, '')
}
