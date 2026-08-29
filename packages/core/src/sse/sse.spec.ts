import { beforeEach, describe, expect, inject, test, vi } from 'vitest'

import {
  createClient,
  withCredentials,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
  withSSEHandle,
  withSSEOnInvalidEvent,
  withSSEReconnect,
} from '../client'
import type { Client } from '../client'
import { ERR_ABORTED } from '../error'
import { createSSEInterceptor } from '../interceptor'
import { struct } from '../struct'
import { defineEventStream } from './index'
import type { EventStreamExecuteOptions } from './sse'
import type { EventStreamHandle } from './transport/event_stream'

function createSSEClientFromText(
  text: string,
  options?: { onInvalidEvent?: Parameters<typeof withSSEOnInvalidEvent>[0]; reconnect?: Parameters<typeof withSSEReconnect>[0] },
): Client {
  const handle = withSSEHandle(
    (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text))
            controller.close()
          },
        }),
        {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        },
      )) as unknown as typeof fetch,
  )

  return createClient(
    withEndpoint('https://api.example.com'),
    handle,
    ...(options?.onInvalidEvent ? [withSSEOnInvalidEvent(options.onInvalidEvent)] : []),
    ...(options?.reconnect ? [withSSEReconnect(options.reconnect)] : []),
  )
}

async function collectStreamEvents<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events: T[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

function createShortCircuitStream(): EventStreamHandle<unknown> {
  let settle: ((value: { code: 'aborted'; cause?: unknown }) => void) | undefined
  let disposeTask: Promise<void> | undefined
  const closed = new Promise<{ code: 'aborted'; cause?: unknown }>((resolve) => {
    settle = resolve
  })

  const handle: EventStreamHandle<unknown> = {
    open: { response: {} as never, url: 'https://short-circuit.example/events' },
    closed,
    close(reason?: unknown) {
      settle?.({ code: 'aborted', cause: reason })
      settle = undefined
    },
    [Symbol.asyncDispose]() {
      return (disposeTask ??= Promise.resolve()
        .then(() => {
          handle.close()
          return handle.closed
        })
        .then(() => undefined))
    },
    [Symbol.asyncIterator]() {
      return {
        async next() {
          return { done: true as const, value: undefined }
        },
      }
    },
  }

  return handle
}

describe('request event stream runtime', () => {
  let baseClient: Client

  beforeEach(() => {
    baseClient = createClient(withEndpoint(inject('testServerHost')))
  })

  test('should resolve event streams through thenable refs', async () => {
    const useBasicStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream, open] = await baseClient.execute(useBasicStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream open result')
    }
    expect(open).toBe(stream.open)
    expect(open.response.ok).toBe(true)
    expect(open.response.headers.get('x-request-id')).toBe('trace-sse-basic')

    const messages: Array<{ data: string; event: string; id?: string }> = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages).toEqual([
      { data: 'first', event: 'message', id: '1' },
      { data: 'second line 1\nsecond line 2', event: 'message', id: '2' },
    ])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should support withCredentials for SSE', async () => {
    const useBasicStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const client = createClient(withEndpoint(inject('testServerHost')), withCredentials(true))
    const [error, stream] = await client.execute(useBasicStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const messages: Array<{ data: string; event: string; id?: string }> = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages.length).toBeGreaterThan(0)
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should handle SSE events without id', async () => {
    const useNoIdStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/no-id',
    })

    const [error, stream] = await baseClient.execute(useNoIdStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const messages: Array<{ data: string; event: string; id?: string }> = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages).toEqual([{ data: 'no-id-message', event: 'message', id: undefined }])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should handle SSE events with empty id', async () => {
    const useEmptyIdStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/empty-id',
    })

    const [error, stream] = await baseClient.execute(useEmptyIdStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const messages: Array<{ data: string; event: string; id?: string }> = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages).toEqual([{ data: 'hello', event: 'message', id: undefined }])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should support default event struct parsing after selecting the event struct', async () => {
    const useMixedStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        default: struct.json(
          struct.object({
            note: struct.string(),
          }),
        ),
        userconnect: struct.json(
          struct.object({
            uid: struct.number(),
          }),
        ),
      },
      path: '/sse/mixed',
    })

    const [error, stream] = await baseClient.execute(useMixedStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: Array<{ data: unknown; event: string }> = []
    for await (const event of stream) {
      events.push({
        data: event.data,
        event: event.event,
      })
    }

    expect(events).toEqual([
      {
        data: { uid: 1 },
        event: 'userconnect',
      },
      {
        data: { note: 'default' },
        event: 'something-else',
      },
    ])
  })

  test('should use the default struct for event names inherited from Object.prototype', async () => {
    const client = createSSEClientFromText('event: constructor\ndata: prototype-safe\n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { default: struct.string() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 'prototype-safe', event: 'constructor', id: undefined }])
  })

  test('should use the default struct for an undeclared __proto__ event', async () => {
    const client = createSSEClientFromText('event: __proto__\ndata: fallback\n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { default: struct.string() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 'fallback', event: '__proto__', id: undefined }])
  })

  test('should decode an object-literal __proto__ event declaration', async () => {
    const client = createSSEClientFromText('event: __proto__\ndata: 7\n\n')
    const events = { __proto__: struct.number() }
    expect(Object.hasOwn(events, '__proto__')).toBe(false)
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 7, event: '__proto__', id: undefined }])
  })

  test('should prefer an object-literal __proto__ declaration over the default struct', async () => {
    const client = createSSEClientFromText('event: __proto__\ndata: 7\n\n')
    const events = { __proto__: struct.number(), default: struct.string() }
    expect(Object.hasOwn(events, '__proto__')).toBe(false)
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 7, event: '__proto__', id: undefined }])
  })

  test('should decode struct.json event payloads with struct key aliases', async () => {
    const useAliasStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        profile: struct.json(
          struct.object({
            displayName: struct.string().alias('display_name'),
            nested: struct.object({
              traceId: struct.string().alias('trace_id'),
            }),
          }),
        ),
      },
      path: '/alias-stream',
    })

    const client = createSSEClientFromText('event: profile\ndata: {"display_name":"Miao","nested":{"trace_id":"trace-1"}}\n\n')

    const [error, stream] = await client.execute(useAliasStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    await expect(collectStreamEvents(stream)).resolves.toEqual([
      {
        data: { displayName: 'Miao', nested: { traceId: 'trace-1' } },
        event: 'profile',
        id: undefined,
      },
    ])
  })

  test('should require struct.json wrapper for object JSON event data', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('event: profile\ndata: {"display_name":"Miao"}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        profile: struct.object({
          displayName: struct.string().alias('display_name'),
        }),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '{"display_name":"Miao"}', reason: 'validation-failed' }])
  })

  test('should report invalid JSON under struct.json without raw-text retry', async () => {
    const invalidEvents: Array<{ data: string; hasCause: boolean; reason: string }> = []
    const client = createSSEClientFromText('event: profile\ndata: {not-json}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({
          data: context.message.data,
          hasCause: context.cause !== undefined,
          reason: context.reason,
        })
      },
    })
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        profile: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '{not-json}', hasCause: true, reason: 'validation-failed' }])
  })

  test('should preserve inner issue paths for struct.json event data', async () => {
    const causes: unknown[] = []
    const client = createSSEClientFromText('event: profile\ndata: {"display_name":123}\n\n', {
      onInvalidEvent: async (context) => {
        causes.push(context.cause)
      },
    })
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        profile: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(causes[0]).toMatchObject({
      name: 'StructError',
      issues: [
        {
          path: ['displayName'],
        },
      ],
    })
  })

  test('should reject plain array JSON text without struct.json wrapper', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data: ["a","b"]\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.array(struct.string()) },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '["a","b"]', reason: 'validation-failed' }])
  })

  test('should reject plain record JSON text without struct.json wrapper', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data: {"count":1}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.record(struct.number()) },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '{"count":1}', reason: 'validation-failed' }])
  })

  test('should reject unsupported request body wrappers at SSE string boundary', async () => {
    const invalidEvents: Array<{ event: string; reason: string }> = []
    const client = createSSEClientFromText(
      'event: form\ndata: title=Miao\n\nevent: urlencoded\ndata: title=Miao\n\nevent: blob\ndata: bytes\n\nevent: arrayBuffer\ndata: bytes\n\n',
      {
        onInvalidEvent: async (context) => {
          invalidEvents.push({ event: context.message.event, reason: context.reason })
        },
      },
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        arrayBuffer: struct.arrayBuffer(),
        blob: struct.blob(),
        form: struct.formData({ title: struct.string() }),
        urlencoded: struct.urlencoded({ title: struct.string() }),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([
      { event: 'form', reason: 'validation-failed' },
      { event: 'urlencoded', reason: 'validation-failed' },
      { event: 'blob', reason: 'validation-failed' },
      { event: 'arrayBuffer', reason: 'validation-failed' },
    ])
  })

  test('should reject an already aborted stream command before startup', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/infinite',
    })

    const controller = new AbortController()
    const command = useStream()
    controller.abort('stop')

    const [error, stream, open] = await baseClient.execute(command, { signal: controller.signal })

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (error?.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('ABORTED')
  })

  test('should reject with.abort and with.timeout before starting SSE transport', async () => {
    const controller = new AbortController()
    let interceptorCalls = 0
    const client = createClient(
      withEndpoint(inject('testServerHost')),
      withHTTPHandle(globalThis.fetch),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          interceptorCalls += 1
          return await next(req)
        }),
      ),
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const command = useStream({})
    const [error, stream, open] = await client.execute(command, {
      abort: controller.signal,
      timeout: 1,
    } as never)

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('abort and timeout cannot be used together')
    expect(interceptorCalls).toBe(0)
  })

  test('should close a stream hidden by a throwing interceptor', async () => {
    const interceptorError = new Error('interceptor failed after open')
    const cancel = vi.fn()
    let hiddenStream: EventStreamHandle<unknown> | undefined
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        async () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          hiddenStream = await next(req)
          throw interceptorError
        }),
      ),
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeDefined()
    expect(stream).toBeUndefined()
    expect(hiddenStream).toBeDefined()
    await expect(hiddenStream?.closed).resolves.toMatchObject({ cause: interceptorError, code: 'aborted' })
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
  })

  test('should stop before fetch when an interceptor aborts before next', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(fetchMock as unknown as typeof fetch),
      withInterceptors(
        createSSEInterceptor((req, next) => {
          controller.abort(ERR_ABORTED)
          return next(req)
        }),
      ),
    )
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: {}, path: '/events' })

    const [error, stream] = await client.execute(useStream(), { signal: controller.signal })

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(stream).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('should not deliver a stream when its interceptor aborts after next', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        async () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          const stream = await next(req)
          controller.abort(ERR_ABORTED)
          return stream
        }),
      ),
    )
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: {}, path: '/events' })

    const [error, stream] = await client.execute(useStream(), { signal: controller.signal })

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(stream).toBeUndefined()
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
  })

  test('should abort a hanging interceptor that never calls next', async () => {
    const controller = new AbortController()
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withInterceptors(
        createSSEInterceptor(async () => {
          markStarted()
          return await new Promise<EventStreamHandle<unknown>>(() => undefined)
        }),
      ),
    )
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: {}, path: '/events' })
    const pending = client.execute(useStream(), { signal: controller.signal })

    await started
    controller.abort('caller stopped')
    const result = await Promise.race([pending, new Promise<false>((resolve) => setTimeout(() => resolve(false), 100))])

    expect(result).not.toBe(false)
    if (result === false) {
      throw new Error('Expected interceptor cancellation to settle')
    }
    expect(result[0]).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(result[1]).toBeUndefined()
  })

  test('should close streams discarded by a successful interceptor', async () => {
    const cancels = [vi.fn(), vi.fn()]
    let fetchIndex = 0
    let discardedStream: EventStreamHandle<unknown> | undefined
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(async () => {
        const cancel = cancels[fetchIndex++]
        return new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: { 'content-type': 'text/event-stream' },
        })
      }),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          discardedStream = await next(req)
          return await next(req)
        }),
      ),
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    expect(stream).toBeDefined()
    expect(discardedStream).toBeDefined()
    await expect(discardedStream?.closed).resolves.toMatchObject({ code: 'aborted' })
    await vi.waitFor(() => expect(cancels[0]).toHaveBeenCalledOnce())
    expect(cancels[1]).not.toHaveBeenCalled()

    stream?.close('test complete')
    await expect(stream?.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should preserve a delegated wrapper returned by an interceptor', async () => {
    const cancel = vi.fn()
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        async () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          const inner = await next(req)
          return {
            get open() {
              return inner.open
            },
            closed: inner.closed,
            close(reason?: unknown) {
              inner.close(reason)
            },
            [Symbol.asyncDispose]() {
              return inner[Symbol.asyncDispose]()
            },
            [Symbol.asyncIterator]() {
              return inner[Symbol.asyncIterator]()
            },
          }
        }),
      ),
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    expect(stream).toBeDefined()
    expect(cancel).not.toHaveBeenCalled()

    stream?.close('test complete')
    await expect(stream?.closed).resolves.toMatchObject({ code: 'aborted' })
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
  })

  test('should close a delayed stream discarded without awaiting interceptor next', async () => {
    const cancel = vi.fn()
    const shortCircuit = createShortCircuitStream()
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: { 'content-type': 'text/event-stream' },
        })
      }),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          void next(req)
          return shortCircuit
        }),
      ),
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    expect(stream).toBe(shortCircuit)
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())

    stream?.close('test complete')
    await expect(stream?.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should reject interceptor next calls after the chain settles', async () => {
    let sourceController: ReadableStreamDefaultController<Uint8Array> | undefined
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              sourceController = controller
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )
    const shortCircuit = createShortCircuitStream()
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(fetchMock),
      withInterceptors(
        createSSEInterceptor(async (req, next) => {
          setTimeout(() => {
            void next(req)
          }, 10)
          return shortCircuit
        }),
      ),
    )
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())
    await new Promise((resolve) => setTimeout(resolve, 30))
    const fetchCalls = fetchMock.mock.calls.length
    sourceController?.close()

    expect(error).toBeNull()
    expect(stream).toBe(shortCircuit)
    expect(fetchCalls).toBe(0)
    stream?.close('test complete')
  })

  test('should prefer SSE cancellation config conflict over an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const command = useStream({})
    const [error, stream, open] = await baseClient.execute(command, {
      abort: controller.signal,
      timeout: 1,
    } as never)

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('abort and timeout cannot be used together')
  })

  test('should abort stream after connection via stream.close', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream] = await baseClient.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    stream.close('user-request')
    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
  })

  test('should skip unexpected stream messages after startup', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.number(),
      },
      path: '/sse/basic',
    })

    const [error, stream] = await baseClient.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([])
    await expect(stream.closed).resolves.toMatchObject({ code: 'eof' })
  })

  test('should return startup error tuple when stream open response is invalid', async () => {
    const useInvalidStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/json',
    })

    const [error, stream, open] = await baseClient.execute(useInvalidStream())

    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(200)
    expect(error?.kind).toBe('definition')

    if (error?.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('RESPONSE_VALIDATION_FAILED')
  })

  test.each([
    [ERR_ABORTED, 'ABORTED'],
    ['caller stopped', 'ABORTED'],
    [new Error('Request timed out'), 'ABORTED'],
    [new DOMException('deadline expired', 'TimeoutError'), 'TIMEOUT'],
  ] as const)('should stop before startup when signal is already aborted with %s', async (reason, expectedCode) => {
    const controller = new AbortController()
    controller.abort(reason)
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    const guardedClient = createClient(withEndpoint('https://api.example.com'), withSSEHandle(fetchMock as unknown as typeof fetch))

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const command = useStream({})
    const [error, stream, open] = await guardedClient.execute(command, { signal: controller.signal })

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe(expectedCode)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('should ignore non-aborted signal during startup', async () => {
    const controller = new AbortController()

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const command = useStream({})
    const [error, stream] = await baseClient.execute(command, { abort: controller.signal })

    expect(error).toBeNull()
    expect(stream).toBeDefined()
  })

  test('should handle stream error state', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/500',
    })

    const [error, stream, open] = await baseClient.execute(useStream())

    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.code).toBe('HTTP_STATUS')
  })

  test('should fill error.data from declared SSE handshake output', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      output: {
        401: struct.object({ code: struct.string() }),
      },
      path: '/sse/handshake-401',
    })

    const handle = async () => Response.json({ code: 'unauthorized' }, { status: 401, headers: { 'content-type': 'application/json' } })

    const client = createClient(withEndpoint('https://example.com'), withSSEHandle(handle))
    const [error] = await client.execute(useStream())

    expect(error?.kind).toBe('http')
    expect(error?.code).toBe('HTTP_STATUS')
    if (error?.kind === 'http') {
      expect(error.status).toBe(401)
      expect(error.data).toEqual({ code: 'unauthorized' })
    }
  })

  test('should keep handshake error.data empty when status is undeclared in output', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      output: { 403: struct.object({ code: struct.string() }) },
      path: '/sse/handshake-401',
    })

    const handle = async () => new Response(null, { status: 401 })

    const client = createClient(withEndpoint('https://example.com'), withSSEHandle(handle))
    const [error] = await client.execute(useStream())
    expect(error?.kind).toBe('http')
    if (error?.kind === 'http') {
      expect(error.status).toBe(401)
      expect(error.data).toBeNull()
    }
  })

  test('should cancel unread handshake body when status is undeclared but body exists', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      output: { 403: struct.object({ code: struct.string() }) },
      path: '/sse/handshake-401',
    })

    const handle = async () =>
      new Response(JSON.stringify({ code: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })

    const client = createClient(withEndpoint('https://example.com'), withSSEHandle(handle))
    const [error] = await client.execute(useStream())
    expect(error?.kind).toBe('http')
    if (error?.kind === 'http') {
      expect(error.status).toBe(401)
      expect(error.data).toBeNull()
    }
  })

  test('should leave handshake error.data null when declared body fails to parse', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: { message: struct.string() },
      output: { 401: struct.object({ code: struct.string() }) },
      path: '/sse/handshake-401',
    })

    const handle = async () => new Response('not-json', { status: 401, headers: { 'content-type': 'application/json' } })

    const client = createClient(withEndpoint('https://example.com'), withSSEHandle(handle))
    const [error] = await client.execute(useStream())
    expect(error?.kind).toBe('http')
    if (error?.kind === 'http') {
      expect(error.status).toBe(401)
      expect(error.data).toBeNull()
    }
  })

  test('should skip unknown event types without default struct', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/unknown-event',
    })

    const [error, stream] = await baseClient.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }
    expect(events).toEqual([])
  })

  test('should parse empty event data', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/empty-data',
    })

    const [error, stream] = await baseClient.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }
    expect(events).toEqual([{ data: '', event: 'message', id: '1' }])
  })

  test('should keep string event data as raw untrimmed text', async () => {
    const client = createSSEClientFromText('data: {"ok":true}\n\ndata:   padded text  \n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.string() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: '{"ok":true}', event: 'message', id: undefined },
      { data: '  padded text  ', event: 'message', id: undefined },
    ])
  })

  test('should keep text body event data as raw untrimmed text', async () => {
    const client = createSSEClientFromText('data: {"ok":true}\n\ndata:   padded text  \n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.text() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: '{"ok":true}', event: 'message', id: undefined },
      { data: '  padded text  ', event: 'message', id: undefined },
    ])
  })

  test('should keep any event data as raw string without JSON decoding', async () => {
    const client = createSSEClientFromText('event: payload\ndata: {"ok":true}\n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { payload: struct.any() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: '{"ok":true}', event: 'payload', id: undefined }])
  })

  test('should keep unknown event data as raw string without JSON decoding', async () => {
    const client = createSSEClientFromText('event: payload\ndata: [1,2,3]\n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { payload: struct.unknown() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: '[1,2,3]', event: 'payload', id: undefined }])
  })

  test('should decode finite number event data from trimmed text', async () => {
    const client = createSSEClientFromText('data:  42  \n\ndata: -1.5\n\n')
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.number() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: 42, event: 'message', id: undefined },
      { data: -1.5, event: 'message', id: undefined },
    ])
  })

  test('should reject empty non-finite and NaN number event data', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data:\n\ndata: NaN\n\ndata: Infinity\n\ndata: -Infinity\n\ndata: 1e309\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.number() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([
      { data: '', reason: 'validation-failed' },
      { data: 'NaN', reason: 'validation-failed' },
      { data: 'Infinity', reason: 'validation-failed' },
      { data: '-Infinity', reason: 'validation-failed' },
      { data: '1e309', reason: 'validation-failed' },
    ])
  })

  test('should decode boolean event data only from exact true and false text', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data: true\n\ndata: false\n\ndata: TRUE\n\ndata: 1\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.boolean() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: true, event: 'message', id: undefined },
      { data: false, event: 'message', id: undefined },
    ])
    expect(invalidEvents).toEqual([
      { data: 'TRUE', reason: 'validation-failed' },
      { data: '1', reason: 'validation-failed' },
    ])
  })

  test('should parse message with empty event name', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
        default: struct.string(),
      },
      path: '/sse/no-event-name',
    })

    const [error, stream] = await baseClient.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }
    expect(events).toEqual([{ data: 'hello', event: 'message', id: '1' }])
  })

  test('should return transport error when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const command = useStream({})
    const [error, stream, open] = await baseClient.execute(command, { abort: controller.signal })

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should return definition error when build throws', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      build: () => {
        throw new Error('build failed')
      },
      events: {
        message: struct.string(),
      },
      input: struct.object({}),
      path: '/sse/basic',
    })

    const [error, stream, open] = await baseClient.execute(useStream({}))

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return http error on non-ok response', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/500',
    })

    const [error, stream, open] = await baseClient.execute(useStream())

    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.code).toBe('HTTP_STATUS')
  })

  test('should use normalized HTTP status error message when SSE response has no error payload', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/500-empty',
    })
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle((async () => new Response(null, { status: 503 })) as unknown as typeof fetch),
    )

    const [error, stream, open] = await client.execute(useStream())

    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(503)
    expect(open?.response?.error).toBeUndefined()
    expect(error?.kind).toBe('http')
    expect(error?.message).toBe('Http failure response: 503')
  })

  test('should invoke onInvalidEvent for unknown event types', async () => {
    const invalidEvents: Array<{ reason: string; event: string }> = []

    const client = createClient(
      withEndpoint(inject('testServerHost')),
      withSSEOnInvalidEvent(async (context) => {
        invalidEvents.push({
          reason: context.reason,
          event: context.message.event,
        })
      }),
    )

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/sse/unknown-event',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([])
    expect(invalidEvents.length).toBeGreaterThan(0)
    const firstInvalidEvent = invalidEvents[0]
    if (!firstInvalidEvent) {
      throw new Error('Expected invalid event')
    }
    expect(firstInvalidEvent.reason).toBe('missing-struct')
  })

  test('should report missing struct with raw data without decoding first', async () => {
    const invalidEvents: Array<{ data: string; event: string; reason: string }> = []
    const client = createSSEClientFromText('event: unknown\ndata: {"display_name":"Miao"}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({
          data: context.message.data,
          event: context.message.event,
          reason: context.reason,
        })
      },
    })
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.string() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([
      {
        data: '{"display_name":"Miao"}',
        event: 'unknown',
        reason: 'missing-struct',
      },
    ])
  })

  test('should invoke onInvalidEvent for struct validation failures', async () => {
    const invalidEvents: Array<{ reason: string; event: string; hasCause: boolean }> = []

    const client = createClient(
      withEndpoint(inject('testServerHost')),
      withSSEOnInvalidEvent(async (context) => {
        invalidEvents.push({
          reason: context.reason,
          event: context.message.event,
          hasCause: context.cause !== undefined,
        })
      }),
    )

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.number(),
      },
      path: '/sse/basic',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([])
    expect(invalidEvents.length).toBeGreaterThan(0)
    const firstInvalidEvent = invalidEvents[0]
    if (!firstInvalidEvent) {
      throw new Error('Expected invalid event')
    }
    expect(firstInvalidEvent.reason).toBe('validation-failed')
    expect(firstInvalidEvent.hasCause).toBe(true)
  })

  test('should include message id in onInvalidEvent for missing-struct', async () => {
    const captured: Array<{ id: string; reason: string }> = []

    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('id: 42\nevent: unknown\ndata: hello\n\n'))
                controller.close()
              },
            }),
            {
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
      withSSEOnInvalidEvent((context) => captured.push({ id: context.message.id, reason: context.reason })),
    )

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/stream',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    for await (const _ of stream) {
      // no events should be yielded
    }

    expect(captured).toEqual([{ id: '42', reason: 'missing-struct' }])
  })

  test('should include empty id in onInvalidEvent for missing-struct', async () => {
    const captured: Array<{ id: string; reason: string }> = []

    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                // No id field — message.id will be empty string
                controller.enqueue(new TextEncoder().encode('event: unknown\ndata: hello\n\n'))
                controller.close()
              },
            }),
            {
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
      withSSEOnInvalidEvent(async (context) => {
        captured.push({ id: context.message.id, reason: context.reason })
      }),
    )

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/stream',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    for await (const _ of stream) {
      // no events should be yielded
    }

    expect(captured).toEqual([{ id: '', reason: 'missing-struct' }])
  })

  test('should include empty id in onInvalidEvent for validation-failed', async () => {
    const captured: Array<{ id: string; reason: string }> = []

    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                // No id field — message.id will be empty string
                controller.enqueue(new TextEncoder().encode('event: message\ndata: not-a-number\n\n'))
                controller.close()
              },
            }),
            {
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
      withSSEOnInvalidEvent(async (context) => {
        captured.push({ id: context.message.id, reason: context.reason })
      }),
    )

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.number(),
      },
      path: '/stream',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    for await (const _ of stream) {
      // no events should be yielded
    }

    expect(captured).toEqual([{ id: '', reason: 'validation-failed' }])
  })

  test('should skip unexpected stream messages without onInvalidEvent', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.number(),
      },
      path: '/sse/basic',
    })

    const [error, stream] = await baseClient.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([])
    await expect(stream.closed).resolves.toMatchObject({ code: 'eof' })
  })

  test('should abort a hanging onInvalidEvent observer with the active attempt signal', async () => {
    const cancelled = vi.fn()
    let markObserverStarted: (() => void) | undefined
    const observerStarted = new Promise<void>((resolve) => {
      markObserverStarted = resolve
    })
    const hangingObserver = new Promise<void>(() => undefined)
    let observerSignal: AbortSignal | undefined

    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('event: unknown\ndata: ignored\n\n'))
              },
              cancel(reason) {
                cancelled(reason)
              },
            }),
            {
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
      withSSEOnInvalidEvent((context) => {
        observerSignal = context.signal
        markObserverStarted?.()
        return hangingObserver
      }),
    )
    const useStream = defineEventStream({ maxBufferSize: 1024, maxQueueSize: 16, events: { message: struct.string() }, path: '/stream' })
    const abortController = new AbortController()

    const [error, stream] = await client.execute(useStream(), { signal: abortController.signal })

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    const next = stream[Symbol.asyncIterator]().next()
    await observerStarted

    abortController.abort(new Error('stop invalid observer'))

    await expect(next).resolves.toEqual({ done: true, value: undefined })
    await expect(stream.closed).resolves.toMatchObject({ code: 'aborted' })
    expect(observerSignal?.aborted).toBe(true)
    expect(cancelled).toHaveBeenCalledTimes(1)
  })

  test('should keep stream alive when onInvalidEvent throws', async () => {
    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('event: unknown\ndata: ignored\n\n'))
                controller.close()
              },
            }),
            {
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
      withSSEOnInvalidEvent(async () => {
        throw new Error('observer failed')
      }),
    )

    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/stream',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([])
    await expect(stream.closed).resolves.toMatchObject({ code: 'eof' })
  })

  test.each([
    ['maxBufferSize', 0],
    ['maxBufferSize', -1],
    ['maxBufferSize', 1.5],
    ['maxBufferSize', Number.POSITIVE_INFINITY],
    ['maxBufferSize', Number.MAX_SAFE_INTEGER + 1],
    ['maxQueueSize', 0],
    ['maxQueueSize', -1],
    ['maxQueueSize', 1.5],
    ['maxQueueSize', Number.POSITIVE_INFINITY],
    ['maxQueueSize', Number.MAX_SAFE_INTEGER + 1],
  ] as const)('should reject invalid endpoint %s value %s before fetching', async (limitName, limit) => {
    const handle = vi.fn() as unknown as typeof fetch
    const client = createClient(withEndpoint('https://api.example.com'), withSSEHandle(handle))
    const useStream = defineEventStream({
      events: { message: struct.string() },
      maxBufferSize: 1024,
      maxQueueSize: 16,
      path: '/stream',
      [limitName]: limit,
    } as never)

    const [error, stream, open] = await client.execute(useStream())

    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(handle).not.toHaveBeenCalled()
  })

  test.each([-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'should reject invalid timeout %s before SSE transport',
    async (timeout) => {
      const handle = vi.fn() as unknown as typeof fetch
      const client = createClient(withEndpoint('https://api.example.com'), withSSEHandle(handle))
      const useStream = defineEventStream({
        events: { message: struct.string() },
        maxBufferSize: 1024,
        maxQueueSize: 16,
        path: '/stream',
      })

      const [error, stream, open] = await client.execute(useStream(), { timeout })

      expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
      expect(stream).toBeUndefined()
      expect(open).toBeUndefined()
      expect(handle).not.toHaveBeenCalled()
    },
  )

  test('should prefer invalid timeout over an already aborted SSE signal alias', async () => {
    const controller = new AbortController()
    controller.abort('caller stopped')
    const useStream = defineEventStream({
      events: { message: struct.string() },
      maxBufferSize: 1024,
      maxQueueSize: 16,
      path: '/stream',
    })

    const [error] = await baseClient.execute(useStream(), { signal: controller.signal, timeout: 0 })

    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
  })

  test('should snapshot SSE cancellation options before asynchronous work', async () => {
    let timeoutReads = 0
    const options = {
      get timeout() {
        timeoutReads += 1
        return timeoutReads === 1 ? undefined : Number.POSITIVE_INFINITY
      },
    }
    const handle = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }), {
          headers: { 'content-type': 'text/event-stream' },
        }),
    )
    const client = createClient(withEndpoint('https://api.example.com'), withSSEHandle(handle as unknown as typeof fetch))
    const useStream = defineEventStream({ events: {}, maxBufferSize: 1024, maxQueueSize: 16, path: '/snapshot' })

    const [error, stream] = await client.execute(useStream(), options as EventStreamExecuteOptions)

    expect(error).toBeNull()
    expect(timeoutReads).toBe(1)
    expect(handle).toHaveBeenCalledOnce()
    await expect(stream?.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should return a definition error when reading SSE cancellation options throws', async () => {
    const options = Object.defineProperty({}, 'abort', {
      get() {
        throw new Error('abort getter failed')
      },
    })
    const useStream = defineEventStream({ events: {}, maxBufferSize: 1024, maxQueueSize: 16, path: '/snapshot' })

    const [error, stream, open] = await baseClient.execute(useStream(), options as EventStreamExecuteOptions)

    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
  })

  test('should handle request validation failure on invalid input', async () => {
    const useStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      input: struct.object({
        id: struct.number(),
      }),
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream, open] = await baseClient.execute(
      useStream(
        // @ts-expect-error testing runtime defensive behavior with invalid input type
        { id: 'invalid' },
      ),
    )

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })
})
