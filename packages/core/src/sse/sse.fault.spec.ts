import { describe, expect, test } from 'vitest'
import { createClient, withEndpoint, withInterceptors, withSSEHandle } from '../client'
import type { Client } from '../client'
import { createSSEInterceptor } from '../interceptor'
import { struct } from '../struct'
import { defineEventStream } from './index'

/**
 * Locks SSE onto the one fault-code namespace shared with HTTP.
 *
 * The two `EXT_*` splits live in `transport/event_stream.advanced.spec.ts`: `onopen`/`onclose`
 * and `transformMessage` are `fetchEventStream` options, not client-level surface.
 *
 * SSE used to carry a parallel `EventStreamErrorCode` set with no `kind` and no mapping to the
 * request error model, and it reported two different kinds of caller code — the lifecycle hooks
 * and the message transform — under a single `EXT_OBSERVER_FAILED`.
 */

const SSE_HEADERS = { 'content-type': 'text/event-stream' }

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function clientReturning(response: () => Response | Promise<Response>, ...options: Parameters<typeof createClient>): Client {
  return createClient(withEndpoint('https://api.example.test'), withSSEHandle(response as unknown as typeof fetch), ...options)
}

const useStream = defineEventStream({
  events: { message: struct.string() },
  maxBufferSize: 1024,
  maxQueueSize: 8,
  path: '/events',
})

describe('sse startup faults', () => {
  test('should report a non-2xx handshake as HTTP_STATUS with the declared error body', async () => {
    const useDeclared = defineEventStream({
      error: struct.object({ reason: struct.string() }),
      events: { message: struct.string() },
      maxBufferSize: 1024,
      maxQueueSize: 8,
      path: '/events',
    })
    const client = clientReturning(
      async () => new Response('{"reason":"forbidden"}', { headers: { 'content-type': 'application/json' }, status: 403 }),
    )

    const [fault] = await client.execute(useDeclared())

    expect(fault?.code).toBe('HTTP_STATUS')
    if (fault?.code !== 'HTTP_STATUS') throw new Error('Expected an http status fault')
    expect(fault.status).toBe(403)
    expect(fault.data).toEqual({ reason: 'forbidden' })
  })

  test('should report a wrong handshake media type as RES_MEDIA_TYPE_INVALID', async () => {
    const client = clientReturning(async () => new Response('not a stream', { headers: { 'content-type': 'text/plain' } }))

    const [fault] = await client.execute(useStream())

    expect(fault?.code).toBe('RES_MEDIA_TYPE_INVALID')
  })

  test('should report a missing handshake body as RES_DECODE_FAILED', async () => {
    const client = clientReturning(async () => new Response(null, { headers: SSE_HEADERS }))

    const [fault] = await client.execute(useStream())

    expect(fault?.code).toBe('RES_DECODE_FAILED')
  })

  test('should report an unreachable transport as NET_UNREACHABLE', async () => {
    const cause = new TypeError('fetch failed')
    const client = clientReturning(async () => {
      throw cause
    })

    const [fault] = await client.execute(useStream())

    expect(fault?.code).toBe('NET_UNREACHABLE')
    expect(fault?.cause).toBe(cause)
  })

  test('should report an interceptor throw as EXT_INTERCEPTOR_FAILED', async () => {
    const cause = new Error('interceptor exploded')
    const client = clientReturning(
      async () => new Response(streamOf('data: hi\n\n'), { headers: SSE_HEADERS }),
      withInterceptors(
        createSSEInterceptor(async () => {
          throw cause
        }),
      ),
    )

    const [fault] = await client.execute(useStream())

    expect(fault?.code).toBe('EXT_INTERCEPTOR_FAILED')
    expect(fault?.cause).toBe(cause)
  })
})

describe('sse runtime faults', () => {
  test('should report a buffer limit as CAP_BUFFER_EXCEEDED', async () => {
    const useTiny = defineEventStream({
      events: { message: struct.string() },
      maxBufferSize: 4,
      maxQueueSize: 8,
      path: '/events',
    })
    const client = clientReturning(async () => new Response(streamOf(`data: ${'x'.repeat(64)}\n\n`), { headers: SSE_HEADERS }))

    const [fault, stream] = await client.execute(useTiny())

    expect(fault).toBeNull()
    if (fault) throw new Error('Expected the stream to open')
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow()
    await expect(stream.closed).resolves.toMatchObject({ code: 'CAP_BUFFER_EXCEEDED', kind: 'error' })
  })

  test('should report a queue overflow as CAP_QUEUE_OVERFLOW', async () => {
    const useTinyQueue = defineEventStream({
      events: { message: struct.string() },
      maxBufferSize: 1024,
      maxQueueSize: 1,
      path: '/events',
    })
    const client = clientReturning(async () => new Response(streamOf('data: a\n\ndata: b\n\ndata: c\n\n'), { headers: SSE_HEADERS }))

    const [fault, stream] = await client.execute(useTinyQueue())

    expect(fault).toBeNull()
    if (fault) throw new Error('Expected the stream to open')
    await expect(stream.closed).resolves.toMatchObject({ code: 'CAP_QUEUE_OVERFLOW', kind: 'error' })
  })

  test('should report a clean end of stream with kind eof and no code', async () => {
    const client = clientReturning(async () => new Response(streamOf('data: hi\n\n'), { headers: SSE_HEADERS }))

    const [fault, stream] = await client.execute(useStream())

    expect(fault).toBeNull()
    if (fault) throw new Error('Expected the stream to open')
    for await (const event of stream) {
      expect(event.data).toBe('hi')
    }
    const closed = await stream.closed
    expect(closed.kind).toBe('eof')
    expect(closed).not.toHaveProperty('code')
  })
})
