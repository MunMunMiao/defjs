import type { HttpRequest } from '../../internal/http_request'

const BODY_CONTENT_TYPE_SOURCE = 'bodyContentTypeSource'

export function serializeHttpBody(
  body: HttpRequest['body'],
): ArrayBuffer | Blob | FormData | URLSearchParams | ReadableStream<Uint8Array> | string | null {
  switch (true) {
    case isFormDataBody(body):
    case isBlobBody(body):
    case body instanceof ArrayBuffer:
    case body instanceof URLSearchParams:
    case typeof ReadableStream !== 'undefined' && body instanceof ReadableStream:
    case typeof body === 'string':
      return body
    case typeof body === 'object':
    case typeof body === 'boolean':
    case typeof body === 'number':
    case Array.isArray(body):
      return JSON.stringify(body)
    default:
      return null
  }
}

export function applyRequestContentType(request: HttpRequest, headers: Headers): void {
  const body = request.body
  if (typeof body === 'undefined') {
    return
  }

  if (isFormDataBody(body)) {
    headers.delete('Content-Type')
    return
  }

  const hasBodyContentTypeSource = Object.hasOwn(request, BODY_CONTENT_TYPE_SOURCE)
  const bodyContentType = !hasBodyContentTypeSource || request.bodyContentTypeSource === body ? request.bodyContentType : undefined

  if (bodyContentType === null) {
    headers.delete('Content-Type')
    return
  }

  if (typeof bodyContentType === 'string') {
    headers.set('Content-Type', bodyContentType)
    return
  }

  const detectedType = resolveHttpBodyContentType(body)
  if (detectedType) {
    headers.set('Content-Type', detectedType)
  }
}

export function resolveHttpBodyContentType(body: HttpRequest['body']): string | null {
  switch (true) {
    case isFormDataBody(body):
      return null
    case body instanceof ArrayBuffer:
      return 'application/octet-stream'
    case isBlobBody(body):
      return body.type || 'application/octet-stream'
    case body instanceof URLSearchParams:
      return 'application/x-www-form-urlencoded;charset=UTF-8'
    case typeof ReadableStream !== 'undefined' && body instanceof ReadableStream:
      return 'application/octet-stream'
    case typeof body === 'string':
      return 'text/plain;charset=UTF-8'
    case body === null:
    case typeof body === 'object' && body !== null:
    case typeof body === 'number':
    case typeof body === 'boolean':
      return 'application/json'
    default:
      return null
  }
}

function isBlobBody(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function isFormDataBody(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData
}
