import { describe, expect, inject, test } from 'vitest'
import { ERR_ABORTED } from '../../error'
import type { HttpRequest } from '../../http'
import type { FetchEventStreamOptions } from './event_stream'
import { fetchEventStream as fetchEventStreamInternal, getErrorOpenInfo } from './event_stream'
import type { EventStreamMessage } from './parser'

type TestOptions<T> = Omit<FetchEventStreamOptions<T>, 'maxBufferSize' | 'maxQueueSize'> & {
  maxBufferSize?: number
  maxQueueSize?: number
}

function fetchEventStream<T = EventStreamMessage>(request: HttpRequest, options: TestOptions<T> = {}) {
  return fetchEventStreamInternal(request, {
    maxBufferSize: 1024,
    maxQueueSize: 16,
    ...options,
  } as FetchEventStreamOptions<T>)
}

describe('fetchEventStream', () => {
  test('should read basic sse messages with open and closed info', async () => {
    const request: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/sse/basic',
      method: 'GET',
    }

    const stream = await fetchEventStream(request)
    expect(stream.open.response.ok).toBe(true)
    expect(stream.open.response.status).toBe(200)
    expect(stream.open.response.headers.get('x-request-id')).toBe('trace-sse-basic')

    const messages: EventStreamMessage[] = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages).toEqual([
      { id: '1', event: 'message', data: 'first' },
      { id: '2', event: 'message', data: 'second line 1\nsecond line 2' },
    ])

    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should retry with last-event-id and update open info', async () => {
    const request: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/events',
      method: 'GET',
    }
    let attempt = 0
    const fetch = async (input: RequestInfo | URL) => {
      attempt += 1
      const lastEventId = new Request(input).headers.get('last-event-id')
      if (attempt === 1) {
        expect(lastEventId).toBeNull()
        let pulled = false
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!pulled) {
                pulled = true
                controller.enqueue(new TextEncoder().encode('id: 1\ndata: first\n\n'))
                return
              }
              controller.error(new Error('connection lost'))
            },
          }),
          { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'attempt-1' } },
        )
      }

      expect(lastEventId).toBe('1')
      return new Response('id: 2\ndata: second\n\n', {
        headers: { 'content-type': 'text/event-stream', 'x-request-id': 'attempt-2' },
      })
    }

    const stream = await fetchEventStream(request, {
      fetch: fetch as typeof globalThis.fetch,
      onerror() {
        return 0
      },
      reconnect: { attempts: 3, delayMs: 0 },
    })

    const messages: EventStreamMessage[] = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages.map((event) => event.data)).toEqual(['first', 'second'])
    expect(stream.open.response.headers.get('x-request-id')).toBe('attempt-2')
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should close stream manually', async () => {
    const request: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/sse/infinite',
      method: 'GET',
    }

    const stream = await fetchEventStream(request)
    const iterator = stream[Symbol.asyncIterator]()
    const first = await iterator.next()

    expect(first.done).toBe(false)
    expect(first.value).toMatchObject({ event: 'tick', data: '1' })

    stream.close('stop')
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(stream.closed).resolves.toEqual({
      code: 'aborted',
      reason: 'stop',
      cause: 'stop',
    })
  })

  test('should reject when response is not event stream', async () => {
    const request: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/json',
      method: 'GET',
    }

    await expect(fetchEventStream(request)).rejects.toThrowError(/Expected content-type/)
  })

  test('should reject non-2xx open responses through response.ok without a synthetic error', async () => {
    const request: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/events',
      method: 'GET',
    }
    let thrown: unknown

    try {
      await fetchEventStream(request, {
        fetch: (async () =>
          new Response('data: ignored\n\n', {
            headers: { 'content-type': 'text/event-stream' },
            status: 503,
            statusText: 'Service Unavailable',
          })) as unknown as typeof fetch,
      })
    } catch (error) {
      thrown = error
    }

    const open = getErrorOpenInfo(thrown)
    expect(thrown).toBeInstanceOf(Error)
    expect(open?.response.ok).toBe(false)
    expect(open?.response.error).toBeUndefined()
  })

  test('should reject with aborted error when aborted before open', async () => {
    const controller = new AbortController()
    controller.abort()

    const request: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/sse/infinite',
      method: 'GET',
      abort: controller.signal,
    }

    await expect(fetchEventStream(request)).rejects.toBe(ERR_ABORTED)
  })
})
