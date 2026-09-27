import type { HttpRequest } from '../../internal/http_request'

const textDecoder = new TextDecoder()

export function getContentLength(headers: Headers): number {
  const value = headers.get('Content-Length')
  if (!value) {
    return 0
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function getContentType(headers: Headers): string {
  return headers.get('Content-Type') || ''
}

/**
 * Whether a `Content-Type` names a JSON representation.
 *
 * Accepts `application/json` and every `+json` structured suffix, which is what real APIs
 * send: `application/problem+json` (RFC 9457), `application/vnd.api+json`, and vendor media
 * types. Parameters and case are ignored.
 *
 * @param contentType - Raw header value, possibly with parameters.
 * @returns True when the essence is JSON.
 */
export function isJsonMediaType(contentType: string): boolean {
  const semicolon = contentType.indexOf(';')
  const essence = (semicolon === -1 ? contentType : contentType.slice(0, semicolon)).trim().toLowerCase()

  return essence === 'application/json' || essence.endsWith('+json')
}

function toArrayBuffer(content: Uint8Array): ArrayBuffer {
  const { buffer, byteLength, byteOffset } = content
  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer
  }
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}

export function parseJsonText(text: string): unknown {
  return text === '' ? null : JSON.parse(text)
}

export function parseBytesBody(responseType: HttpRequest['responseType'], content: Uint8Array, contentType: string): unknown {
  switch (responseType) {
    case 'json':
      return parseJsonText(textDecoder.decode(content))
    case 'text':
      return textDecoder.decode(content)
    case 'blob':
      return new Blob([toArrayBuffer(content)], { type: contentType })
    case 'arraybuffer':
      return toArrayBuffer(content)
    default:
      return null
  }
}

export function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const chunksAll = new Uint8Array(totalLength)
  let position = 0
  for (const chunk of chunks) {
    chunksAll.set(chunk, position)
    position += chunk.length
  }

  return chunksAll
}
