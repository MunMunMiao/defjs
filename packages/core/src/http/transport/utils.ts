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

export function parseBody(params: { request: HttpRequest; contentType: string; content: Uint8Array }): unknown {
  const { request, content, contentType } = params
  return parseBytesBody(request.responseType, content, contentType)
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
