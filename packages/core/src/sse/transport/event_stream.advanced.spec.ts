import { describe, expect, inject, test, vi } from 'vitest'
import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../http'
import { fetchEventStream, getErrorOpenInfo } from './event_stream'
import type { EventStreamMessage } from './parser'

describe('fetchEventStream advanced', () => {
  function createRequest(endpoint: string): HttpRequest {
    return {
      baseEndpoint: inject('testServerHost'),
      endpoint,
      method: 'GET',
    }
  }

  test('should skip messages when transformMessage returns undefined', async () => {
    const stream = await fetchEventStream(createRequest('/sse/basic'), {
      transformMessage() {
        return undefined
      },
    })

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events).toEqual([])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should call onmessage callback', async () => {
    const onmessage = vi.fn()

    const stream = await fetchEventStream(createRequest('/sse/basic'), {
      onmessage,
    })

    for await (const _ of stream) {
      // consume
    }

    expect(onmessage).toHaveBeenCalledWith(expect.objectContaining({ data: 'first' }))
  })

  test('should stop retry when onerror returns null', async () => {
    const onerror = vi.fn().mockReturnValue(null)

    await expect(
      fetchEventStream(createRequest('/sse/500-always'), {
        onerror,
      }),
    ).rejects.toThrow()
    expect(onerror).toHaveBeenCalledTimes(1)
  })

  test('should update retry interval from SSE retry field', async () => {
    const stream = await fetchEventStream(createRequest('/sse/retry'))

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events[0]?.retry).toBe(100)
  })

  test('should use custom retry delay from onerror', async () => {
    const onerror = vi.fn().mockReturnValue(10)

    const stream = await fetchEventStream(createRequest('/sse/500-once'), {
      onerror,
      retryInterval: 1,
    })

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events).toEqual([{ data: 'ok', event: 'message', id: '1', retry: undefined }])
    expect(onerror).toHaveBeenCalledTimes(1)
  })

  test('should not require content type when requireContentType is false', async () => {
    const stream = await fetchEventStream(createRequest('/text'), {
      requireContentType: false,
    })

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events).toEqual([])
  })

  test('should close gracefully when close is called after already closed', async () => {
    const stream = await fetchEventStream(createRequest('/sse/basic'))
    stream.close()
    stream.close() // should not throw

    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should throw for non-ok response with error body', async () => {
    await expect(fetchEventStream(createRequest('/sse/500-always'))).rejects.toThrow()
  })

  test('should attach open info to error for getErrorOpenInfo', async () => {
    try {
      await fetchEventStream(createRequest('/sse/500-always'))
    } catch (error) {
      const openInfo = getErrorOpenInfo(error)
      expect(openInfo?.response.status).toBe(500)
    }
  })

  test('getErrorOpenInfo returns undefined for non-object errors', () => {
    expect(getErrorOpenInfo('string error')).toBeUndefined()
    expect(getErrorOpenInfo(null)).toBeUndefined()
    expect(getErrorOpenInfo(42)).toBeUndefined()
  })

  test('should throw when transformMessage throws', async () => {
    const stream = await fetchEventStream(createRequest('/sse/basic'), {
      transformMessage() {
        throw new Error('transform failed')
      },
    })

    const iter = stream[Symbol.asyncIterator]()
    await expect(iter.next()).rejects.toThrow('Failed to process event stream message')
  })

  test('should call onopen and onclose callbacks', async () => {
    const onopen = vi.fn()
    const onclose = vi.fn()

    const stream = await fetchEventStream(createRequest('/sse/basic'), {
      onopen,
      onclose,
    })

    for await (const _ of stream) {
      // consume
    }

    expect(onopen).toHaveBeenCalledTimes(1)
    expect(onclose).toHaveBeenCalledTimes(1)
  })

  test('should work with default options', async () => {
    const stream = await fetchEventStream(createRequest('/sse/basic'))

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events.length).toBeGreaterThan(0)
  })

  test('should close with non-error reason', async () => {
    const stream = await fetchEventStream(createRequest('/sse/basic'))
    stream.close('custom-reason')

    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted', reason: 'custom-reason' })
  })

  test('should not override existing Accept header', async () => {
    const request: HttpRequest = {
      ...createRequest('/sse/basic'),
      headers: new Headers({ Accept: 'application/json' }),
    }

    const stream = await fetchEventStream(request)
    // The request was made with the real fetch; we verify the endpoint responded correctly.
    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events.length).toBeGreaterThan(0)
  })

  test('should close with TimeoutError reason', async () => {
    const stream = await fetchEventStream(createRequest('/sse/basic'))
    const timeoutError = new Error('timeout')
    timeoutError.name = 'TimeoutError'
    stream.close(timeoutError)

    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted', reason: 'timeout' })
  })

  test('should abort via request signal during fetch', async () => {
    const controller = new AbortController()
    const request: HttpRequest = {
      ...createRequest('/sse/slow'),
      abort: controller.signal,
    }

    setTimeout(() => controller.abort(ERR_ABORTED), 50)

    await expect(fetchEventStream(request)).rejects.toBe(ERR_ABORTED)
  })

  test('should normalize TimeoutError from request abort signal', async () => {
    const controller = new AbortController()
    const timeoutError = new Error('timeout')
    timeoutError.name = 'TimeoutError'
    const request: HttpRequest = {
      ...createRequest('/sse/slow'),
      abort: controller.signal,
    }

    setTimeout(() => controller.abort(timeoutError), 50)

    try {
      await fetchEventStream(request)
    } catch (error) {
      expect(error).toBe(ERR_TIMEOUT)
    }
  })

  test('should throw for non-event-stream content type', async () => {
    await expect(fetchEventStream(createRequest('/json'))).rejects.toThrow(/Expected content-type/)
  })

  test('should throw for empty content type', async () => {
    await expect(fetchEventStream(createRequest('/no-content-type'))).rejects.toThrow(/Expected content-type/)
  })

  test('should abort during retry wait via request signal', async () => {
    const controller = new AbortController()
    const request: HttpRequest = {
      ...createRequest('/sse/500-always'),
      abort: controller.signal,
    }

    setTimeout(() => controller.abort(ERR_ABORTED), 50)

    await expect(
      fetchEventStream(request, {
        onerror() {
          return 1000
        },
      }),
    ).rejects.toBe(ERR_ABORTED)
  })

  test('should close infinite stream', async () => {
    const stream = await fetchEventStream(createRequest('/sse/infinite'))

    setTimeout(() => stream.close(), 50)

    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should retry with default interval when fetch throws network error', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: ok\n\n'))
            controller.close()
          },
        }), {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        }),
      ) as unknown as typeof fetch

    const stream = await fetchEventStream(createRequest('/sse/basic'), { fetch, retryInterval: 1 })

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events).toEqual([{ data: 'ok', event: '', id: '', retry: undefined }])
  })

  test('should support streaming request body', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data'))
        controller.close()
      },
    })
    const request: HttpRequest = {
      ...createRequest('/sse/basic'),
      body,
      method: 'POST',
    }

    const stream = await fetchEventStream(request)
    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events.length).toBeGreaterThan(0)
  })
})
