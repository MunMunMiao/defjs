import type { QueryParamsSerializer } from '../client/config'
import type { HttpContext } from '../internal/context'
import type { HttpProgressFn, HttpRequest, HttpResponseType } from '../internal/http_request'
import { buildRequest, type RequestBuildHandler } from '../internal/request_builder'
import { appendRecordToHeaders, createSearchParams, fillUrl } from '../internal/url'
import type { AnyCompatibleSchema } from '../schema'

export type ResponseGroupItem<S extends number = number, B extends AnyCompatibleSchema = AnyCompatibleSchema> = {
  body: B
  status: S | readonly S[]
}

export type RequestOutputShape = Record<number, AnyCompatibleSchema> | readonly ResponseGroupItem[]

export function createHttpRequest<TInput>(
  method: string,
  path: string,
  input: TInput,
  build: RequestBuildHandler<TInput> | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    downloadProgress?: HttpProgressFn
    queryParamsSerializer: QueryParamsSerializer
    responseType?: HttpResponseType
    timeout?: number
    uploadProgress?: HttpProgressFn
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
    downloadProgress: options.downloadProgress,
    endpoint: fillUrl(path, built.params),
    headers,
    method,
    queryParams,
    queryString: options.queryParamsSerializer(queryParams),
    responseType: options.responseType,
    timeout: options.timeout,
    uploadProgress: options.uploadProgress,
    withCredentials: built.withCredentials ?? options.withCredentials ?? false,
  }
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

export function normalizeOutputShape(output: RequestOutputShape): Map<number, AnyCompatibleSchema> {
  const map = new Map<number, AnyCompatibleSchema>()

  if (Array.isArray(output)) {
    for (const item of output) {
      const statuses = Array.isArray(item.status) ? item.status : [item.status]
      for (const status of statuses) {
        map.set(status, item.body)
      }
    }
    return map
  }

  for (const [status, schema] of Object.entries(output)) {
    map.set(Number(status), schema)
  }

  return map
}
