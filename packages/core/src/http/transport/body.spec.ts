import { describe, expect, test } from 'vitest'
import { detectHttpContentType, serializeHttpBody } from './body'

describe('http utils', () => {
  test('should keep native body types as-is when serializing', () => {
    const formData = new FormData()
    formData.append('name', 'miao')

    const blob = new Blob(['hello'], { type: 'text/plain' })
    const arrayBuffer = new Uint8Array([1, 2, 3]).buffer
    const searchParams = new URLSearchParams({ page: '1' })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })

    expect(serializeHttpBody(formData)).toBe(formData)
    expect(serializeHttpBody(blob)).toBe(blob)
    expect(serializeHttpBody(arrayBuffer)).toBe(arrayBuffer)
    expect(serializeHttpBody(searchParams)).toBe(searchParams)
    expect(serializeHttpBody(stream)).toBe(stream)
    expect(serializeHttpBody('hello')).toBe('hello')
  })

  test('should stringify json-like bodies when serializing', () => {
    expect(serializeHttpBody({ id: 1, name: 'Miao' })).toBe('{"id":1,"name":"Miao"}')
    expect(serializeHttpBody(['a', 'b'])).toBe('["a","b"]')
    expect(serializeHttpBody(true)).toBe('true')
    expect(serializeHttpBody(123)).toBe('123')
  })

  test('should return null for unsupported serialized bodies', () => {
    expect(serializeHttpBody(undefined)).toBeNull()
    expect(serializeHttpBody(null)).toBe('null')
    expect(serializeHttpBody((() => 'noop') as never)).toBeNull()
  })

  test('should detect content type for supported body types', () => {
    const formData = new FormData()
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const searchParams = new URLSearchParams({ page: '1' })
    const arrayBuffer = new Uint8Array([1, 2, 3]).buffer
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    expect(detectHttpContentType(formData)).toBeNull()
    expect(detectHttpContentType(arrayBuffer)).toBe('application/octet-stream')
    expect(detectHttpContentType(blob)).toBe(blob.type)
    expect(detectHttpContentType(new Blob(['hello']))).toBe('application/octet-stream')
    expect(detectHttpContentType(searchParams)).toBe('application/x-www-form-urlencoded;charset=UTF-8')
    expect(detectHttpContentType(stream)).toBe('application/octet-stream')
    expect(detectHttpContentType('hello')).toBe('text/plain;charset=UTF-8')
    expect(detectHttpContentType({ ok: true })).toBe('application/json')
    expect(detectHttpContentType(['a', 'b'])).toBe('application/json')
    expect(detectHttpContentType(true)).toBe('application/json')
    expect(detectHttpContentType(1)).toBe('application/json')
  })

  test('should return null content type for unsupported bodies', () => {
    expect(detectHttpContentType(undefined)).toBeNull()
    expect(detectHttpContentType(null)).toBeNull()
    expect(detectHttpContentType((() => 'noop') as never)).toBeNull()
  })
})
