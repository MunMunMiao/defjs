import type { HttpRequest } from './http_request'
import type {
  RequestBodyOptions,
  RequestBuildValue,
  RequestFormDataFileLike,
  RequestFormDataScalar,
  RequestFormDataValue,
} from './request_values'

type RequestFormDataArrayItem = RequestFormDataScalar | RequestFormDataFileLike

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

type RequestBuilderState = {
  bodySet: boolean
  snapshot: RequestBuild
}

export function buildRequest<TInput>(input: TInput, build: RequestBuildHandler<TInput> | undefined): RequestBuild {
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
      const body = new URLSearchParams()
      setBody(state, body, options?.contentType ?? 'application/x-www-form-urlencoded;charset=UTF-8')
      for (const [key, value] of Object.entries(record)) {
        appendUrlEncodedBodyValue(body, key, value)
      }
    },
    headers(record) {
      state.snapshot.headers ??= new Headers()
      appendHeaders(state.snapshot.headers, record)
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

function appendHeaders(headers: Headers, value: HeadersInit | Record<string, RequestBuildValue>): void {
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

function appendRequestFormDataValue(formData: FormData, key: string, value: RequestFormDataValue): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendRequestFormDataItem(formData, key, item as RequestFormDataArrayItem)
    }
    return
  }

  appendRequestFormDataItem(formData, key, value as RequestFormDataScalar | RequestFormDataFileLike)
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

function appendUrlEncodedBodyValue(searchParams: URLSearchParams, key: string, value: RequestBuildValue): void {
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
