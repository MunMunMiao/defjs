import type { HttpRequest } from './http_request'
import type { RequestBuildValue } from './request_values'

export function fillUrl(path: string, params?: { [key: string]: RequestBuildValue }): string {
  const paramMap = new Map<string, string>()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'undefined') {
        continue
      }

      if (Array.isArray(value)) {
        const first = value[0]
        if (typeof first !== 'undefined') {
          if (!isScalarSearchParamValue(first)) {
            throw new TypeError(`path value for "${key}" requires a scalar value`)
          }
          paramMap.set(key, serializeValue(first))
        }
        continue
      }

      if (!isScalarSearchParamValue(value)) {
        throw new TypeError(`path value for "${key}" requires a scalar value`)
      }

      paramMap.set(key, serializeValue(value))
    }
  }

  return path.replace(/:([^/]+)/g, (_, part) => paramMap.get(part) ?? 'undefined')
}

export interface SearchParamsOptions {
  allowComplex?: boolean
}

export function createSearchParams(query?: { [key: string]: RequestBuildValue }, options: SearchParamsOptions = {}): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (!query) {
    return searchParams
  }

  for (const [key, value] of Object.entries(query)) {
    appendToSearchParams(searchParams, key, value, options)
  }

  return searchParams
}

export function appendRecordToHeaders(headers: Headers, value?: HeadersInit | { [key: string]: RequestBuildValue }): void {
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
        if (!isScalarSearchParamValue(item)) {
          throw new TypeError(`header value for "${key}" requires a scalar value`)
        }
        headers.append(key, serializeValue(item))
      }
      continue
    }

    if (!isScalarSearchParamValue(headerValue)) {
      throw new TypeError(`header value for "${key}" requires a scalar value`)
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
// Replaces the near-identical `createRequestUrl` helpers previously duplicated in fetch/sse/test_handler.
export function resolveRequestUrl(request: HttpRequest): URL {
  if (!request.baseEndpoint) {
    throw new TypeError('Client endpoint is required')
  }
  const queryString =
    typeof request.queryString === 'string' ? request.queryString : request.queryParams ? request.queryParams.toString() : ''
  return createResolvedRequestUrl(request.baseEndpoint, request.endpoint, queryString)
}

function appendToSearchParams(searchParams: URLSearchParams, key: string, value: RequestBuildValue, options: SearchParamsOptions): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'undefined') {
        continue
      }

      if (isScalarSearchParamValue(item)) {
        searchParams.append(key, serializeValue(item))
        continue
      }

      if (!options.allowComplex) {
        throw new TypeError(`query value for "${key}" requires queryParamsSerializer or a scalar value`)
      }
    }
    return
  }

  if (!isScalarSearchParamValue(value)) {
    if (!options.allowComplex) {
      throw new TypeError(`query value for "${key}" requires queryParamsSerializer or a scalar value`)
    }
    return
  }

  searchParams.set(key, serializeValue(value))
}

function isScalarSearchParamValue(value: unknown): value is boolean | null | number | string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

function serializeValue(value: boolean | null | number | string): string {
  return value === null ? 'null' : String(value)
}

function createEndpointDirectoryBase(baseEndpoint: string): URL {
  let base: URL
  try {
    base = new URL(baseEndpoint)
  } catch {
    throw new TypeError('Client endpoint must be a valid URL')
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
