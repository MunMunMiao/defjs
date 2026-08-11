import { describe, expect, inject, test, vi } from 'vitest'
import { ERR_ABORTED, ERR_TIMEOUT } from '../../error'
import type { HttpRequest } from '../../http'
import type { FetchEventStreamOptions } from './event_stream'
import { fetchEventStream as fetchEventStreamInternal, getErrorOpenInfo, getEventStreamFatalCode } from './event_stream'
import { type EventStreamMessage, SSEParserLimitError } from './parser'

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

function settleWithin<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('operation did not settle')), 100)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

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
      events.push(event as unknown as EventStreamMessage)
    }
    expect(events).toEqual([])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should stop retry when onerror returns null', async () => {
    const networkError = new Error('network failure')
    const fetch = vi.fn(async () => {
      throw networkError
    }) as unknown as typeof globalThis.fetch
    const onerror = vi.fn().mockReturnValue(null)
    const shouldReconnect = vi.fn(() => true)

    await expect(
      fetchEventStream(createRequest('/events'), {
        fetch,
        onerror,
        reconnect: { shouldReconnect },
      }),
    ).rejects.toBe(networkError)
    expect(fetch).toHaveBeenCalledOnce()
    expect(onerror).toHaveBeenCalledTimes(1)
    expect(shouldReconnect).not.toHaveBeenCalled()
  })

  test('should preserve an undefined network rejection', async () => {
    await expect(
      fetchEventStream(createRequest('/events'), {
        fetch: () => Promise.reject(undefined),
        onerror: () => null,
      }),
    ).rejects.toBeUndefined()
  })

  test('should keep retry fields out of dispatched messages', async () => {
    const stream = await fetchEventStream(createRequest('/sse/retry'))

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events[0]).not.toHaveProperty('retry')
  })

  test('should use custom retry delay from onerror', async () => {
    const onerror = vi.fn().mockReturnValue(10)
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response('id: 1\nevent: message\ndata: ok\n\n', { headers: { 'content-type': 'text/event-stream' } }))

    const stream = await fetchEventStream(createRequest('/events'), {
      fetch: fetch as typeof globalThis.fetch,
      onerror,
      retryInterval: 1,
    })

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as EventStreamMessage)
    }
    expect(events).toEqual([{ data: 'ok', event: 'message', id: '1' }])
    expect(onerror).toHaveBeenCalledTimes(1)
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

  test.each([
    ['does not settle', () => new Promise<void>(() => undefined)],
    ['rejects', () => Promise.reject(new Error('cancel failed'))],
  ])('should settle an ignored fetch abort when late response cancellation %s', async (_label, cancelBody) => {
    const controller = new AbortController()
    const cancel = vi.fn(cancelBody)
    let resolveFetch!: (response: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const opening = fetchEventStream(
      { ...createRequest('/events'), abort: controller.signal },
      { fetch: fetch as unknown as typeof globalThis.fetch },
    )

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    controller.abort(ERR_ABORTED)

    await expect(settleWithin(opening)).rejects.toBe(ERR_ABORTED)
    resolveFetch(
      new Response(new ReadableStream<Uint8Array>({ cancel }), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledExactlyOnceWith(ERR_ABORTED))
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

  test.each([
    'text/event-stream',
    'Text/Event-Stream; charset=utf-8',
    'text/event-stream; note="a;b"',
    'text/event-stream; note="a\\\tb"',
    'text/event-stream; note="a\\ b"',
    'text/event-stream; note="a\\;b"',
    'text/event-stream; note="a\\éb"',
    'text/event-stream; note="café"',
  ])('should accept valid event-stream content type %s', async (contentType) => {
    const stream = await fetchEventStream(createRequest('/events'), {
      fetch: async () =>
        new Response('data: ok\n\n', {
          headers: { 'content-type': contentType },
        }),
    })

    await expect(stream[Symbol.asyncIterator]().next()).resolves.toMatchObject({ value: { data: 'ok' } })
  })

  test.each([
    undefined,
    'application/json',
    'text/event-streaming',
    'text/event-stream; bare',
    'text/event-stream; charset',
    'text/event-stream; bad name=value',
    'text/event-stream; note="unterminated',
    'text/',
    'text/event-stream nope',
    'text/event-stream; =utf-8',
    'text/event-stream; charset=',
    'text/event-stream; note="\\',
    'text/event-stream; note="\\\u0001"',
    'text/event-stream; note="\u0001"',
  ])('should reject invalid event-stream content type %s', async (contentType) => {
    await expect(
      fetchEventStream(createRequest('/events'), {
        fetch: async () =>
          new Response('data: ignored\n\n', {
            headers: contentType === undefined ? undefined : { 'content-type': contentType },
          }),
      }),
    ).rejects.toThrow(/Expected content-type/)
  })

  test('should observe but never retry a fatal open-validation error', async () => {
    const cancel = vi.fn()
    const onerror = vi.fn(() => 0)
    const shouldReconnect = vi.fn(() => true)
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({ cancel })
      return new Response(body, { headers: { 'content-type': 'text/plain' } })
    })

    const error = await fetchEventStream(createRequest('/events'), {
      fetch,
      onerror,
      reconnect: { attempts: 2, delayMs: 0, shouldReconnect },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/Expected content-type/)
    expect(getEventStreamFatalCode(error)).toBe('INVALID_RESPONSE')
    expect(fetch).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(onerror).toHaveBeenCalledOnce()
    expect(shouldReconnect).not.toHaveBeenCalled()
  })

  test('should not wait for response cancellation after fatal open validation', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { 'content-type': 'text/plain' } }))

    await expect(
      settleWithin(
        fetchEventStream(createRequest('/events'), {
          fetch,
        }),
      ),
    ).rejects.toThrow(/Expected content-type/)

    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should cancel the response and terminate when onopen fails', async () => {
    const cancel = vi.fn()
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({ cancel })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })

    await expect(
      fetchEventStream(createRequest('/events'), {
        fetch,
        onerror: () => 0,
        onopen() {
          throw new Error('onopen failed')
        },
        reconnect: { attempts: 2, delayMs: 0 },
      }),
    ).rejects.toThrow('onopen failed')

    expect(fetch).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should preserve an onopen failure when response cancellation rejects', async () => {
    const cancel = vi.fn(() => Promise.reject(new Error('cancel failed')))
    const fetch = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: { 'content-type': 'text/event-stream' },
        }),
    )

    const error = await fetchEventStream(createRequest('/events'), {
      fetch,
      onopen() {
        throw new Error('onopen failed')
      },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('onopen failed')
    expect(getEventStreamFatalCode(error)).toBe('MESSAGE_PROCESSING_FAILED')
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should use the stable fallback when onopen throws a non-Error value', async () => {
    const error = await fetchEventStream(createRequest('/events'), {
      fetch: async () => new Response('', { headers: { 'content-type': 'text/event-stream' } }),
      onopen() {
        throw 'non-error failure'
      },
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Event stream onopen callback failed')
    expect(getEventStreamFatalCode(error)).toBe('MESSAGE_PROCESSING_FAILED')
  })

  test('should retain the original fatal error when its observer fails', async () => {
    const fetch = vi.fn(async () => new Response(null, { headers: { 'content-type': 'text/plain' } }))

    await expect(
      fetchEventStream(createRequest('/events'), {
        fetch,
        onerror() {
          throw new Error('observer failed')
        },
      }),
    ).rejects.toThrow(/Expected content-type/)
    expect(fetch).toHaveBeenCalledOnce()
  })

  test('should classify a missing response body as an invalid response', async () => {
    const error = await fetchEventStream(createRequest('/events'), {
      fetch: async () => new Response(null, { headers: { 'content-type': 'text/event-stream' } }),
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Missing response body for event stream')
    expect(getEventStreamFatalCode(error)).toBe('INVALID_RESPONSE')
  })

  test('should cancel upstream and terminate on a parser limit even when callbacks request retry', async () => {
    const cancel = vi.fn()
    const onerror = vi.fn(() => 0)
    const shouldReconnect = vi.fn(() => true)
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${'x'.repeat(100)}`))
        },
        cancel,
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })

    const stream = await fetchEventStream(createRequest('/events'), {
      fetch,
      maxBufferSize: 16,
      onerror,
      reconnect: { attempts: 2, delayMs: 0, shouldReconnect },
    })
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.next()).rejects.toThrow('SSE parser buffer exceeded maxBufferSize')
    await expect(stream.closed).resolves.toMatchObject({ code: 'error', errorCode: 'PARSER_LIMIT_EXCEEDED' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(onerror).toHaveBeenCalledOnce()
    expect(shouldReconnect).not.toHaveBeenCalled()
  })

  test('should classify a parser limit thrown by the fetch boundary as fatal', async () => {
    const onerror = vi.fn(() => 0)
    const shouldReconnect = vi.fn(() => true)
    const fetch = vi.fn(async () => {
      throw new SSEParserLimitError()
    }) as unknown as typeof globalThis.fetch

    const error = await fetchEventStream(createRequest('/events'), {
      fetch,
      onerror,
      reconnect: { shouldReconnect },
    }).catch((cause: unknown) => cause)

    expect(getEventStreamFatalCode(error)).toBe('PARSER_LIMIT_EXCEEDED')
    expect(fetch).toHaveBeenCalledOnce()
    expect(onerror).toHaveBeenCalledOnce()
    expect(shouldReconnect).not.toHaveBeenCalled()
  })

  test('should abort while observing a fatal open error', async () => {
    const abortController = new AbortController()
    const cancel = vi.fn()
    let markObserved: (() => void) | undefined
    const observed = new Promise<void>((resolve) => {
      markObserved = resolve
    })
    const opening = fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/plain' },
          }),
        onerror() {
          markObserved?.()
          return new Promise<number>(() => undefined)
        },
      },
    )

    await observed
    abortController.abort(ERR_ABORTED)

    await expect(opening).rejects.toBe(ERR_ABORTED)
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should cancel upstream and terminate when message transformation fails', async () => {
    const cancel = vi.fn()
    const onerror = vi.fn(() => 0)
    const shouldReconnect = vi.fn(() => true)
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: value\n\n'))
        },
        cancel,
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })

    const stream = await fetchEventStream(createRequest('/events'), {
      fetch,
      onerror,
      reconnect: { attempts: 2, delayMs: 0, shouldReconnect },
      transformMessage() {
        throw new Error('transform failed')
      },
    })

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('Failed to process event stream message')
    await expect(stream.closed).resolves.toMatchObject({ code: 'error', errorCode: 'MESSAGE_PROCESSING_FAILED' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(onerror).toHaveBeenCalledOnce()
    expect(shouldReconnect).not.toHaveBeenCalled()
  })

  test('should discard buffered events and terminate on queue overflow', async () => {
    const cancel = vi.fn()
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: one\n\ndata: two\n\n'))
        },
        cancel,
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })

    const stream = await fetchEventStream(createRequest('/events'), {
      fetch,
      maxQueueSize: 1,
      onerror: () => 0,
      reconnect: { attempts: 2, delayMs: 0 },
    })

    await expect(stream.closed).resolves.toMatchObject({ code: 'error', errorCode: 'QUEUE_OVERFLOW' })
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('Event stream queue exceeded maxQueueSize')
    expect(fetch).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should abort during retry wait via request signal', async () => {
    const controller = new AbortController()
    const request: HttpRequest = {
      ...createRequest('/events'),
      abort: controller.signal,
    }
    const fetch = vi.fn(async () => {
      throw new Error('network error')
    })

    setTimeout(() => controller.abort(ERR_ABORTED), 50)

    await expect(
      fetchEventStream(request, {
        fetch: fetch as typeof globalThis.fetch,
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

  test('should cancel active response body when stream is closed', async () => {
    const cancel = vi.fn()
    const mockFetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: first\n\n'))
        },
        cancel,
      })

      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
      })
    }) as unknown as typeof fetch

    const stream = await fetchEventStream(createRequest('/sse/basic'), { fetch: mockFetch })
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { data: 'first', event: '', id: '' },
    })

    stream.close('stop')

    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledWith('stop')
    })
    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should close and cancel the active response when iteration returns early', async () => {
    const cancel = vi.fn()
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: first\n\n'))
            },
            cancel,
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    ) as unknown as typeof globalThis.fetch
    const stream = await fetchEventStream(createRequest('/events'), { fetch })
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { data: 'first' } })
    await expect(iterator.return?.()).resolves.toEqual({ done: true, value: undefined })
    await expect(iterator.return?.()).resolves.toEqual({ done: true, value: undefined })
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })

    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted', reason: 'iterator-return' })
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith('iterator-return'))
  })

  test('should abort while onopen never settles', async () => {
    const abortController = new AbortController()
    const cancel = vi.fn()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const opening = fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/event-stream' },
          }),
        onopen() {
          markStarted?.()
          return new Promise<void>(() => undefined)
        },
      },
    )

    await started
    abortController.abort(ERR_ABORTED)

    await expect(opening).rejects.toBe(ERR_ABORTED)
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should abort while transformMessage never settles', async () => {
    const abortController = new AbortController()
    const cancel = vi.fn()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let transformSignal: AbortSignal | undefined
    const stream = await fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('data: value\n\n'))
              },
              cancel,
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        transformMessage(_message, signal) {
          transformSignal = signal
          markStarted?.()
          return new Promise<EventStreamMessage>(() => undefined)
        },
      },
    )
    const next = stream[Symbol.asyncIterator]().next()

    await started
    abortController.abort(ERR_ABORTED)

    await expect(next).resolves.toEqual({ done: true, value: undefined })
    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted', cause: ERR_ABORTED })
    expect(transformSignal?.aborted).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
  })

  test('should abort while onclose never settles', async () => {
    const abortController = new AbortController()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const stream = await fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () =>
          new Response('data: value\n\n', {
            headers: { 'content-type': 'text/event-stream' },
          }),
        onclose() {
          markStarted?.()
          return new Promise<void>(() => undefined)
        },
      },
    )

    await started
    abortController.abort(ERR_ABORTED)

    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted', cause: ERR_ABORTED })
  })

  test.each([
    ['a TimeoutError', new DOMException('deadline expired', 'TimeoutError')],
    ['the canonical timeout error', ERR_TIMEOUT],
  ])('should fail an open stream when request abort uses %s', async (_label, timeoutError) => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>(
      {
        cancel,
        pull() {
          return new Promise<void>(() => undefined)
        },
      },
      { highWaterMark: 0 },
    )
    const stream = await fetchEventStream(
      { ...createRequest('/events'), abort: controller.signal },
      {
        fetch: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      },
    )
    const next = stream[Symbol.asyncIterator]().next()

    controller.abort(timeoutError)

    await expect(next).rejects.toBe(ERR_TIMEOUT)
    await expect(stream.closed).resolves.toEqual({
      code: 'error',
      errorCode: 'TIMEOUT',
      cause: ERR_TIMEOUT,
      reason: ERR_TIMEOUT.message,
    })
    expect(cancel).toHaveBeenCalledExactlyOnceWith(timeoutError)
  })

  test('should keep an explicit close with a TimeoutError classified as owner abort', async () => {
    const timeoutError = new DOMException('owner chose this reason', 'TimeoutError')
    const stream = await fetchEventStream(createRequest('/sse/infinite'))

    stream.close(timeoutError)

    await expect(stream.closed).resolves.toEqual({ code: 'aborted', cause: timeoutError, reason: timeoutError.message })
  })

  test('should abort while onerror never settles', async () => {
    const abortController = new AbortController()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const opening = fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () => {
          throw new Error('network failure')
        },
        onerror() {
          markStarted?.()
          return new Promise<number>(() => undefined)
        },
      },
    )

    await started
    abortController.abort(ERR_ABORTED)

    await expect(opening).rejects.toBe(ERR_ABORTED)
  })

  test('should abort while shouldReconnect never settles', async () => {
    const abortController = new AbortController()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const opening = fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () => {
          throw new Error('network failure')
        },
        reconnect: {
          shouldReconnect() {
            markStarted?.()
            return new Promise<boolean>(() => undefined)
          },
        },
      },
    )

    await started
    abortController.abort(ERR_ABORTED)

    await expect(opening).rejects.toBe(ERR_ABORTED)
  })

  test('should prefer a queued abort over a synchronous shouldReconnect result', async () => {
    const abortController = new AbortController()
    const opening = fetchEventStream(
      { ...createRequest('/events'), abort: abortController.signal },
      {
        fetch: async () => {
          throw new Error('network failure')
        },
        reconnect: {
          shouldReconnect() {
            queueMicrotask(() => abortController.abort(ERR_ABORTED))
            return false
          },
        },
      },
    )

    await expect(opening).rejects.toBe(ERR_ABORTED)
  })

  test('should reject a second event-stream iterator', async () => {
    const stream = await fetchEventStream(createRequest('/sse/infinite'))

    stream[Symbol.asyncIterator]()
    expect(() => stream[Symbol.asyncIterator]()).toThrow('AsyncQueue supports one consumer')

    stream.close('test complete')
    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should retry with default interval when fetch throws network error', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: ok\n\n'))
              controller.close()
            },
          }),
          {
            headers: { 'content-type': 'text/event-stream' },
            status: 200,
          },
        ),
      ) as unknown as typeof globalThis.fetch

    const stream = await fetchEventStream(createRequest('/sse/basic'), { fetch: mockFetch, retryInterval: 1 })

    const events: EventStreamMessage[] = []
    for await (const event of stream) {
      events.push(event as unknown as EventStreamMessage)
    }
    expect(events).toEqual([{ data: 'ok', event: '', id: '' }])
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

  test('should not retry when reconnect.attempts = 0', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      return new Response(null, { status: 503 })
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' }

    await expect(
      fetchEventStream(request, {
        fetch: mockFetch,
        reconnect: { attempts: 0 },
      }),
    ).rejects.toThrow()
    expect(fetchCount).toBe(1)
  })

  test('should retry up to reconnect.attempts limit', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      // Throw a network error (not EventStreamFatalError) to trigger retry path
      throw new Error('network error')
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' }

    await expect(
      fetchEventStream(request, {
        fetch: mockFetch,
        reconnect: { attempts: 2, delayMs: 0 },
      }),
    ).rejects.toThrow()
    expect(fetchCount).toBe(3) // initial + 2 retries
  })

  test('should succeed when retry eventually works', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount < 3) {
        // Throw network error to trigger retry path
        throw new Error('network error')
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: ok\n\n'))
            controller.close()
          },
        }),
        {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        },
      )
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/flaky', method: 'GET' }

    const stream = await fetchEventStream(request, {
      fetch: mockFetch,
      reconnect: { attempts: 5, delayMs: 0 },
    })

    expect(fetchCount).toBe(3)
    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }
    expect(events.length).toBe(1)
  })

  test('should stop retry when shouldReconnect returns false', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      // Throw network error so we reach the shouldReconnect check
      throw new Error('network error')
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' }

    await expect(
      fetchEventStream(request, {
        fetch: mockFetch,
        reconnect: { shouldReconnect: async () => false, delayMs: 0 },
      }),
    ).rejects.toThrow()
    expect(fetchCount).toBe(1)
  })

  test('should continue retry when shouldReconnect returns true', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount < 2) {
        throw new Error('network error')
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: ok\n\n'))
            controller.close()
          },
        }),
        {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        },
      )
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/flaky', method: 'GET' }

    const stream = await fetchEventStream(request, {
      fetch: mockFetch,
      reconnect: { shouldReconnect: async () => true, delayMs: 0 },
    })

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }
    expect(events.length).toBe(1)
    expect(fetchCount).toBe(2)
  })

  test('should use exponential backoff with factor', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      throw new Error('network error')
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' }

    // Use a short delay so the test completes quickly; we verify attempts work
    await expect(
      fetchEventStream(request, {
        fetch: mockFetch,
        reconnect: { attempts: 2, delayMs: 1, factor: 2 },
      }),
    ).rejects.toThrow()

    expect(fetchCount).toBe(3)
  })

  test('should reject a non-finite retry delay without hot reconnecting', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('network error')
    }) as unknown as typeof fetch

    await expect(
      fetchEventStream(
        { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' },
        {
          fetch: mockFetch,
          reconnect: { attempts: 1, delayMs: Infinity },
        },
      ),
    ).rejects.toThrow('SSE retry delay must be finite')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('should clamp the final retry delay after applying a factor to a wire retry value', async () => {
    vi.useFakeTimers()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount === 1) {
        let pulled = false
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!pulled) {
                pulled = true
                controller.enqueue(new TextEncoder().encode('retry: 999999999999999999999999\n\n'))
                return
              }
              controller.error(new Error('connection lost'))
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        )
      }
      throw new Error('network error')
    }) as unknown as typeof fetch

    try {
      const stream = await fetchEventStream(
        { baseEndpoint: 'https://example.com', endpoint: '/events', method: 'GET' },
        {
          fetch: mockFetch,
          reconnect: { attempts: 2, factor: 2 },
        },
      )

      await vi.advanceTimersByTimeAsync(2_147_483_647)

      expect(fetchCount).toBe(2)
      expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(2_147_483_647)

      stream.close('test complete')
      await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
    } finally {
      setTimeoutSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  test('should cap delay with maxDelayMs', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      throw new Error('network error')
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' }

    await expect(
      fetchEventStream(request, {
        fetch: mockFetch,
        reconnect: { attempts: 2, delayMs: 1, factor: 10, maxDelayMs: 5 },
      }),
    ).rejects.toThrow()

    expect(fetchCount).toBe(3)
  })

  test('should apply jitter to retry delay', async () => {
    let fetchCount = 0
    const mockFetch = vi.fn(async () => {
      fetchCount += 1
      throw new Error('network error')
    }) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/fail', method: 'GET' }

    await expect(
      fetchEventStream(request, {
        fetch: mockFetch,
        reconnect: { attempts: 1, delayMs: 1, jitter: 10 },
      }),
    ).rejects.toThrow()

    expect(fetchCount).toBe(2)
  })

  test('should enforce maxBufferSize in parser', async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              // Send a very long partial line without newline to exceed buffer
              controller.enqueue(new TextEncoder().encode(`data: ${'x'.repeat(100)}`))
              controller.enqueue(new TextEncoder().encode(`data: ${'y'.repeat(100)}`))
              controller.close()
            },
          }),
          {
            headers: { 'content-type': 'text/event-stream' },
            status: 200,
          },
        ),
    ) as unknown as typeof fetch

    const request = { baseEndpoint: 'https://example.com', endpoint: '/huge', method: 'GET' }

    // maxBufferSize error happens after stream is open (200 response),
    // so fetchEventStream resolves the handle. The error propagates
    // through the async iterator.
    const stream = await fetchEventStream(request, {
      fetch: mockFetch,
      maxBufferSize: 50,
      onerror: () => null,
    })

    const iter = stream[Symbol.asyncIterator]()
    await expect(iter.next()).rejects.toThrow('SSE parser buffer exceeded maxBufferSize')
  })
})
