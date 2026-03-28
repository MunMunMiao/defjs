import { type Client, getClientConfig, getGlobalClient, type QueryParamsSerializer } from './client'
import { type HttpContext, makeHttpContext } from './context'
import type { HttpProgressFn, HttpRequest, HttpResponseType } from './http'
import type { InterceptorFn } from './interceptor'
import { makeInterceptorChain } from './interceptor/interceptor'
import { ERR_ABORTED, ERR_INVALID_CLIENT_ENDPOINT, ERR_TIMEOUT, type HttpResponse, makeResponse } from './response'
import { type AnyCompatibleSchema, type CompatibleInputOf, type CompatibleOutputOf, parseCompatibleSchema, SchemaError } from './schema'

export type RequestBuildValue = readonly unknown[] | Record<string, unknown> | string | number | boolean | null | undefined

export type RequestFormDataScalar = boolean | null | number | string | undefined
export type RequestFormDataFileLike = Blob | File
type RequestFormDataArrayItem = RequestFormDataScalar | RequestFormDataFileLike
export type RequestFormDataValue =
  | RequestFormDataScalar
  | RequestFormDataFileLike
  | readonly RequestFormDataScalar[]
  | readonly RequestFormDataFileLike[]

export interface RequestBodyOptions {
  readonly contentType?: string
}

export interface RequestBuilder {
  body(value: HttpRequest['body'], options?: RequestBodyOptions): void
  formData(record: Record<string, RequestFormDataValue>): void
  formUrlEncoded(record: Record<string, RequestBuildValue>, options?: RequestBodyOptions): void
  headers(record: HeadersInit | Record<string, RequestBuildValue>): void
  html(value: string, options?: RequestBodyOptions): void
  json(value: unknown, options?: RequestBodyOptions): void
  pathParams(record: Record<string, RequestBuildValue>): void
  queryParams(record: Record<string, RequestBuildValue>): void
  text(value: string, options?: RequestBodyOptions): void
  withCredentials(value: boolean): void
  xml(value: string, options?: RequestBodyOptions): void
}

export type RequestBuild = {
  body?: HttpRequest['body']
  bodyContentType?: string | null
  headers?: Headers
  params?: Record<string, RequestBuildValue>
  query?: Record<string, RequestBuildValue>
  withCredentials?: boolean
}

export type RequestBuildHandler<TInput> = (request: RequestBuilder, input: TInput) => void

export type EndpointInput<TInput extends AnyCompatibleSchema | undefined> = TInput extends AnyCompatibleSchema
  ? CompatibleInputOf<TInput>
  : unknown

export type ParsedInput<TInput extends AnyCompatibleSchema | undefined> = TInput extends AnyCompatibleSchema
  ? CompatibleOutputOf<TInput>
  : unknown

export type SettledResponse<TBody = unknown> = HttpResponse<TBody> & {
  readonly ok: boolean
}

export interface HttpStatusError<TErrorData = unknown> {
  data: TErrorData
  kind: 'http'
  message: string
  response: SettledResponse<unknown>
  status: number
}

export interface TransportError {
  cause?: unknown
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  kind: 'transport'
  message: string
}

export interface DefinitionError {
  cause?: unknown
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  kind: 'definition'
  message: string
  response?: SettledResponse<unknown>
}

export type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError

type RequestBuilderState = {
  bodySet: boolean
  snapshot: RequestBuild
}

export function resolveClientConfig(client?: Client) {
  const resolvedClient = client ?? getGlobalClient()
  return getClientConfig(resolvedClient)
}

export async function parseEndpointInput<TInput extends AnyCompatibleSchema | undefined>(
  schema: TInput,
  input: EndpointInput<TInput> | undefined,
): Promise<ParsedInput<TInput>> {
  if (!schema) {
    return input as ParsedInput<TInput>
  }

  return (await parseCompatibleSchema(schema, input)) as ParsedInput<TInput>
}

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
    context: mergeHttpContexts(undefined, options.context),
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

export function createWebSocketBuild<TInput>(input: TInput, build: RequestBuildHandler<TInput> | undefined): RequestBuild {
  const built = buildRequest(input, build)

  if (
    typeof built.body !== 'undefined' ||
    typeof built.bodyContentType !== 'undefined' ||
    typeof built.headers !== 'undefined' ||
    typeof built.withCredentials !== 'undefined'
  ) {
    throw new Error('WebSocket build() only supports pathParams() and queryParams() in v1')
  }

  return built
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

export function createResolvedRequestUrl(baseEndpoint: string, path: string, queryString = ''): URL {
  const base = createEndpointDirectoryBase(baseEndpoint)
  const normalizedPath = normalizeEndpointPath(path)
  const url = new URL(normalizedPath, base)
  url.search = queryString
  return url
}

export function resolveDefaultResponseType(
  output: Record<number, AnyCompatibleSchema> | readonly { body: AnyCompatibleSchema; status: number | readonly number[] }[] | undefined,
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

export function mergeHttpContexts(primary?: HttpContext, secondary?: HttpContext): HttpContext {
  if (!primary && !secondary) {
    return makeHttpContext()
  }

  if (!primary) {
    return secondary ? makeHttpContext(secondary) : makeHttpContext()
  }

  if (!secondary) {
    return makeHttpContext(primary)
  }

  const merged = makeHttpContext(primary)
  for (const token of secondary.keys()) {
    merged.set(token, secondary.get(token))
  }
  return merged
}

export async function applyRequestInterceptors(request: HttpRequest, interceptors: InterceptorFn[]): Promise<HttpRequest> {
  if (interceptors.length === 0) {
    return request
  }

  let finalRequest = request
  const captureHandler = async (nextRequest: HttpRequest) => {
    finalRequest = nextRequest
    return makeResponse({
      body: null,
      status: 204,
    })
  }

  const chain = makeInterceptorChain(interceptors)
  await chain(request, captureHandler)
  return finalRequest
}

export function mergeAbortSignals(controller: AbortSignal, signals: (AbortSignal | undefined)[], timeout?: number): AbortSignal {
  const merged = [controller, ...signals.filter((signal): signal is AbortSignal => Boolean(signal))]

  if (typeof timeout === 'number' && timeout > 0) {
    merged.push(AbortSignal.timeout(timeout))
  }

  const [firstSignal] = merged
  if (merged.length === 1 && firstSignal) {
    return firstSignal
  }

  return AbortSignal.any(merged)
}

export function toSettledResponse<TBody>(response: HttpResponse<TBody>): SettledResponse<TBody> {
  return {
    ...response,
    ok: response.status >= 200 && response.status < 300,
  }
}

export function createTransportError(cause: unknown): TransportError {
  if (cause === ERR_ABORTED || (cause instanceof Error && cause.message === ERR_ABORTED.message)) {
    return {
      cause,
      code: 'ABORTED',
      kind: 'transport',
      message: ERR_ABORTED.message,
    }
  }

  if (cause === ERR_TIMEOUT || (cause instanceof Error && cause.message === ERR_TIMEOUT.message)) {
    return {
      cause,
      code: 'TIMEOUT',
      kind: 'transport',
      message: ERR_TIMEOUT.message,
    }
  }

  return {
    cause,
    code: 'NETWORK_ERROR',
    kind: 'transport',
    message: cause instanceof Error ? cause.message : 'NETWORK_ERROR',
  }
}

export function createDefinitionError(code: DefinitionError['code'], cause: unknown, response?: SettledResponse<unknown>): DefinitionError {
  return {
    cause,
    code,
    kind: 'definition',
    message: cause instanceof Error ? cause.message : String(cause),
    response,
  }
}

export function createRequestRuntimeError(cause: unknown, response?: SettledResponse<unknown>): RequestError<unknown> {
  const rootCause = unwrapErrorCause(cause)

  if (response && !response.ok) {
    return {
      data: undefined,
      kind: 'http',
      message: response.error instanceof Error ? response.error.message : String(response.error ?? `HTTP ${response.status}`),
      response,
      status: response.status,
    }
  }

  if (rootCause instanceof SchemaError) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', rootCause, response)
  }

  if (rootCause instanceof Error && /Expected content-type/.test(rootCause.message)) {
    return createDefinitionError('RESPONSE_VALIDATION_FAILED', rootCause, response)
  }

  return createTransportError(rootCause)
}

export function unwrapErrorCause(cause: unknown): unknown {
  let current = cause

  while (current instanceof Error && 'cause' in current && typeof current.cause !== 'undefined') {
    current = current.cause
  }

  return current
}

function buildRequest<TInput>(input: TInput, build: RequestBuildHandler<TInput> | undefined): RequestBuild {
  if (!build) {
    return {}
  }

  const state: RequestBuilderState = {
    bodySet: false,
    snapshot: {},
  }

  build(createRequestBuilder(state), input)
  return state.snapshot
}

function createRequestBuilder(state: RequestBuilderState): RequestBuilder {
  return {
    body(value, options) {
      setBody(state, value, options?.contentType)
    },
    formData(record) {
      if (typeof FormData === 'undefined') {
        throw new Error('FormData is not supported in current runtime')
      }

      const body = new FormData()
      for (const [key, value] of Object.entries(record)) {
        appendRequestFormDataValue(body, key, value)
      }

      setBody(state, body)
    },
    formUrlEncoded(record, options) {
      setBody(state, createSearchParams(record), options?.contentType ?? 'application/x-www-form-urlencoded;charset=UTF-8')
    },
    headers(record) {
      state.snapshot.headers ??= new Headers()
      appendRecordToHeaders(state.snapshot.headers, record)
    },
    html(value, options) {
      setBody(state, value, options?.contentType ?? 'text/html;charset=UTF-8')
    },
    json(value, options) {
      setBody(state, JSON.stringify(value) as HttpRequest['body'], options?.contentType ?? 'application/json')
    },
    pathParams(record) {
      state.snapshot.params = {
        ...(state.snapshot.params ?? {}),
        ...record,
      }
    },
    queryParams(record) {
      state.snapshot.query = {
        ...(state.snapshot.query ?? {}),
        ...record,
      }
    },
    text(value, options) {
      setBody(state, value, options?.contentType ?? 'text/plain;charset=UTF-8')
    },
    withCredentials(value) {
      state.snapshot.withCredentials = value
    },
    xml(value, options) {
      setBody(state, value, options?.contentType ?? 'application/xml;charset=UTF-8')
    },
  }
}

function setBody(state: RequestBuilderState, value: HttpRequest['body'], contentType?: string | null): void {
  if (state.bodySet) {
    throw new Error('Request body can only be set once')
  }

  state.bodySet = true
  state.snapshot.body = value
  state.snapshot.bodyContentType = typeof contentType === 'string' ? contentType : (contentType ?? undefined)
}

function appendRequestFormDataValue(formData: FormData, key: string, value: RequestFormDataValue): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendRequestFormDataArrayItem(formData, key, item as RequestFormDataArrayItem)
    }
    return
  }

  appendRequestFormDataItem(formData, key, value as RequestFormDataScalar | RequestFormDataFileLike)
}

function appendRequestFormDataArrayItem(formData: FormData, key: string, value: RequestFormDataScalar | RequestFormDataFileLike): void {
  appendRequestFormDataItem(formData, key, value)
}

function appendRequestFormDataItem(formData: FormData, key: string, value: RequestFormDataScalar | RequestFormDataFileLike): void {
  if (typeof value === 'undefined') {
    return
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    formData.append(key, value)
    return
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    formData.append(key, String(value))
    return
  }

  throw new Error(`request.formData() does not support value for key "${key}"`)
}
