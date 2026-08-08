import { beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, withCredentials, withEndpoint, withHTTPHandle, withInterceptors, withSSEHandle, withSSEOptions } from '../client'
import type { Client } from '../client'
import { ERR_ABORTED } from '../error'
import { createSSEInterceptor } from '../interceptor'
import { struct } from '../struct'
import { defineEventStream } from './index'

function createSSEClientFromText(text: string, options?: Parameters<typeof withSSEOptions>[0]): Client {
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

  return options
    ? createClient(withEndpoint('https://api.example.com'), handle, withSSEOptions(options))
    : createClient(withEndpoint('https://api.example.com'), handle)
}

async function collectStreamEvents<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events: T[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe('request event stream runtime', () => {
  let baseClient: Client

  beforeEach(() => {
    baseClient = createClient(withEndpoint(inject('testServerHost')))
  })

  test('should resolve event streams through thenable refs', async () => {
    const useBasicStream = defineEventStream({
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream, open] = await baseClient.execute(useBasicStream())

    expect(error).toBeNull()
    expect(open?.response?.ok).toBe(true)
    expect(open?.response?.headers.get('x-request-id')).toBe('trace-sse-basic')
    if (!stream) {
      throw new Error('Expected stream open result')
    }

    const messages: Array<{ data: string; event: string; id?: string }> = []
    for await (const event of stream) {
      messages.push(event)
    }

    expect(messages).toEqual([
      { data: 'first', event: 'message', id: '1', retry: undefined },
      { data: 'second line 1\nsecond line 2', event: 'message', id: '2', retry: undefined },
    ])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should support withCredentials for SSE', async () => {
    const useBasicStream = defineEventStream({
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

    expect(messages).toEqual([{ data: 'no-id-message', event: 'message', id: undefined, retry: undefined }])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should handle SSE events with empty id', async () => {
    const useEmptyIdStream = defineEventStream({
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

    expect(messages).toEqual([{ data: 'hello', event: 'message', id: undefined, retry: undefined }])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should support default event struct parsing after selecting the event struct', async () => {
    const useMixedStream = defineEventStream({
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
    const useStream = defineEventStream({
      events: { default: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: 'prototype-safe', event: 'constructor', id: undefined, retry: undefined },
    ])
  })

  test('should use the default struct for an undeclared __proto__ event', async () => {
    const client = createSSEClientFromText('event: __proto__\ndata: fallback\n\n')
    const useStream = defineEventStream({ events: { default: struct.string() }, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 'fallback', event: '__proto__', id: undefined, retry: undefined }])
  })

  test('should decode an object-literal __proto__ event declaration', async () => {
    const client = createSSEClientFromText('event: __proto__\ndata: 7\n\n')
    const events = { __proto__: struct.number() }
    expect(Object.hasOwn(events, '__proto__')).toBe(false)
    const useStream = defineEventStream({ events, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 7, event: '__proto__', id: undefined, retry: undefined }])
  })

  test('should prefer an object-literal __proto__ declaration over the default struct', async () => {
    const client = createSSEClientFromText('event: __proto__\ndata: 7\n\n')
    const events = { __proto__: struct.number(), default: struct.string() }
    expect(Object.hasOwn(events, '__proto__')).toBe(false)
    const useStream = defineEventStream({ events, path: '/events' })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: 7, event: '__proto__', id: undefined, retry: undefined }])
  })

  test('should decode struct.json event payloads with struct key aliases', async () => {
    const useAliasStream = defineEventStream({
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
        retry: undefined,
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

  test('should allow closing stream refs before startup', async () => {
    const useStream = defineEventStream({
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
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
    expect(interceptorCalls).toBe(0)
  })

  test('should prefer SSE cancellation config conflict over an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)
    const useStream = defineEventStream({
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
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  })

  test('should abort stream after connection via stream.close', async () => {
    const useStream = defineEventStream({
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

  test('should abort before startup when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const useStream = defineEventStream({
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
  })

  test('should ignore non-aborted signal during startup', async () => {
    const controller = new AbortController()

    const useStream = defineEventStream({
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

  test('should skip unknown event types without default struct', async () => {
    const useStream = defineEventStream({
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
    expect(events).toEqual([{ data: '', event: 'message', id: '1', retry: undefined }])
  })

  test('should keep string event data as raw untrimmed text', async () => {
    const client = createSSEClientFromText('data: {"ok":true}\n\ndata:   padded text  \n\n')
    const useStream = defineEventStream({
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: '{"ok":true}', event: 'message', id: undefined, retry: undefined },
      { data: '  padded text  ', event: 'message', id: undefined, retry: undefined },
    ])
  })

  test('should keep text body event data as raw untrimmed text', async () => {
    const client = createSSEClientFromText('data: {"ok":true}\n\ndata:   padded text  \n\n')
    const useStream = defineEventStream({
      events: { message: struct.text() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: '{"ok":true}', event: 'message', id: undefined, retry: undefined },
      { data: '  padded text  ', event: 'message', id: undefined, retry: undefined },
    ])
  })

  test('should keep any event data as raw string without JSON decoding', async () => {
    const client = createSSEClientFromText('event: payload\ndata: {"ok":true}\n\n')
    const useStream = defineEventStream({
      events: { payload: struct.any() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: '{"ok":true}', event: 'payload', id: undefined, retry: undefined }])
  })

  test('should keep unknown event data as raw string without JSON decoding', async () => {
    const client = createSSEClientFromText('event: payload\ndata: [1,2,3]\n\n')
    const useStream = defineEventStream({
      events: { payload: struct.unknown() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([{ data: '[1,2,3]', event: 'payload', id: undefined, retry: undefined }])
  })

  test('should decode finite number event data from trimmed text', async () => {
    const client = createSSEClientFromText('data:  42  \n\ndata: -1.5\n\n')
    const useStream = defineEventStream({
      events: { message: struct.number() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: 42, event: 'message', id: undefined, retry: undefined },
      { data: -1.5, event: 'message', id: undefined, retry: undefined },
    ])
  })

  test('should reject empty non-finite and NaN number event data', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data:\n\ndata: NaN\n\ndata: Infinity\n\ndata: -Infinity\n\ndata: 1e309\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      events: { message: struct.number() },
      path: '/events',
    })

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
    const useStream = defineEventStream({
      events: { message: struct.boolean() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: true, event: 'message', id: undefined, retry: undefined },
      { data: false, event: 'message', id: undefined, retry: undefined },
    ])
    expect(invalidEvents).toEqual([
      { data: 'TRUE', reason: 'validation-failed' },
      { data: '1', reason: 'validation-failed' },
    ])
  })

  test('should parse message with empty event name', async () => {
    const useStream = defineEventStream({
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
    expect(events).toEqual([{ data: 'hello', event: 'message', id: '1', retry: undefined }])
  })

  test('should return transport error when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)

    const useStream = defineEventStream({
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
    expect(error?.kind).toBe('http')
    expect(error?.message).toBe('Http failure response for (unknown url): 503')
  })

  test('should invoke onInvalidEvent for unknown event types', async () => {
    const invalidEvents: Array<{ reason: string; event: string }> = []

    const client = createClient(
      withEndpoint(inject('testServerHost')),
      withSSEOptions({
        onInvalidEvent: async (context) => {
          invalidEvents.push({
            reason: context.reason,
            event: context.message.event,
          })
        },
      }),
    )

    const useStream = defineEventStream({
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
    const useStream = defineEventStream({
      events: { message: struct.string() },
      path: '/events',
    })

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
      withSSEOptions({
        onInvalidEvent: async (context) => {
          invalidEvents.push({
            reason: context.reason,
            event: context.message.event,
            hasCause: context.cause !== undefined,
          })
        },
      }),
    )

    const useStream = defineEventStream({
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
      withSSEOptions({
        onInvalidEvent: async (context) => {
          captured.push({ id: context.message.id, reason: context.reason })
        },
      }),
    )

    const useStream = defineEventStream({
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
      withSSEOptions({
        onInvalidEvent: async (context) => {
          captured.push({ id: context.message.id, reason: context.reason })
        },
      }),
    )

    const useStream = defineEventStream({
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
      withSSEOptions({
        onInvalidEvent: async (context) => {
          captured.push({ id: context.message.id, reason: context.reason })
        },
      }),
    )

    const useStream = defineEventStream({
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
      withSSEOptions({
        onInvalidEvent: async () => {
          throw new Error('observer failed')
        },
      }),
    )

    const useStream = defineEventStream({
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

  test('should handle request validation failure on invalid input', async () => {
    const useStream = defineEventStream({
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
