import type { HttpRequest } from './http'

export function serializeHttpBody(
  body: HttpRequest['body'],
): ArrayBuffer | Blob | FormData | URLSearchParams | ReadableStream<Uint8Array> | string | null {
  switch (true) {
    case body instanceof FormData:
    case body instanceof Blob:
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

export function detectHttpContentType(body: HttpRequest['body']): string | null {
  switch (true) {
    case body instanceof FormData:
      return null
    case body instanceof ArrayBuffer:
      return 'application/octet-stream'
    case body instanceof Blob:
      return body.type || 'application/octet-stream'
    case body instanceof URLSearchParams:
      return 'application/x-www-form-urlencoded;charset=UTF-8'
    case typeof ReadableStream !== 'undefined' && body instanceof ReadableStream:
      return 'application/octet-stream'
    case typeof body === 'string':
      return 'text/plain;charset=UTF-8'
    case typeof body === 'object' && body !== null:
    case typeof body === 'number':
    case typeof body === 'boolean':
      return 'application/json'
    default:
      return null
  }
}
