import { describe, expect, inject, test } from 'vitest'
import type { HttpRequest } from '../../http'
import { ERR_ABORTED } from '../../response'
import { type EventStreamMessage, fetchEventStream } from './event_stream'

describe('fetchEventStream', () => {
  test('should read basic sse messages with open and closed info', async () => {
    const request: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/sse/basic',
      method: 'GET',
    }

    const stream = await fetchEventStream(request)
    expect(stream.open.response.status).toBe(200)
    expect(stream.open.response.headers.get('x-request-id')).toBe('trace-sse-basic')

    const messages: EventStreamMessage[] = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages).toEqual([
      { id: '1', event: 'message', data: 'first', retry: undefined },
      { id: '2', event: 'message', data: 'second line 1\nsecond line 2', retry: undefined },
    ])

    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should retry with last-event-id and update open info', async () => {
    const request: HttpRequest = {
      baseEndpoint: inject('testServerHost'),
      endpoint: '/sse/retry',
      method: 'GET',
    }

    const seen: string[] = []
    const stream = await fetchEventStream(request, {
      onmessage(message) {
        seen.push(message.data)
      },
      onclose() {
        if (seen.length < 2) {
          throw new Error('retry')
        }
      },
      onerror() {
        return 0
      },
    })

    const messages: EventStreamMessage[] = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages.map(event => event.data)).toEqual(['first', 'second'])
    expect(stream.open.response.headers.get('x-request-id')).toBe('trace-sse-retry-2')
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
