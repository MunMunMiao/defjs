import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import {
  createClient,
  getGlobalClient,
  resetGlobalClient,
  setGlobalClient,
  withCredentials,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
  withSSEHandle,
  withSSEOptions,
} from '../client'
import { ERR_ABORTED } from '../error'
import { createSSEInterceptor } from '../interceptor'
import { struct, tag } from '../struct'
import { defineEventStream } from './index'

describe('request event stream runtime', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should resolve event streams through thenable refs', async () => {
    const useBasicStream = defineEventStream({
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream, open] = (await getGlobalClient().execute(useBasicStream())) as any

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
    const [error, stream] = (await client.execute(useBasicStream())) as any

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

    const [error, stream] = (await getGlobalClient().execute(useNoIdStream())) as any

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

    const [error, stream] = (await getGlobalClient().execute(useEmptyIdStream())) as any

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

  test('should support default event schema parsing', async () => {
    const useMixedStream = defineEventStream({
      events: {
        default: struct.object({
          note: struct.string(),
        }),
        userconnect: struct.object({
          uid: struct.number(),
        }),
      },
      path: '/sse/mixed',
    })

    const [error, stream] = (await getGlobalClient().execute(useMixedStream())) as any

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
        data: { note: 'fallback' },
        event: 'something-else',
      },
    ])
  })

  test('should decode event payloads with struct key aliases', async () => {
    const useAliasStream = defineEventStream({
      events: {
        profile: struct.object({
          displayName: struct.string().tag(tag.json('display_name')),
        }),
      },
      path: '/alias-stream',
    })

    const client = createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('event: profile\ndata: {"display_name":"Miao"}\n\n'))
                controller.close()
              },
            }),
            {
              headers: {
                'content-type': 'text/event-stream',
              },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
    )

    const [error, stream] = (await client.execute(useAliasStream())) as any

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        data: { displayName: 'Miao' },
        event: 'profile',
        id: undefined,
        retry: undefined,
      },
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

    const [error, stream, open] = (await getGlobalClient().execute(command, { signal: controller.signal })) as any

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

    const command = useStream(
      {},
      // @ts-expect-error testing runtime defensive behavior with invalid config combination
      { abort: controller.signal, timeout: 1 },
    )
    const [error, stream, open] = (await client.execute(command)) as any

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

    const command = useStream(
      {},
      // @ts-expect-error testing runtime defensive behavior with invalid config combination
      { abort: controller.signal, timeout: 1 },
    )
    const [error, stream, open] = (await getGlobalClient().execute(command)) as any

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

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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

    const [error, stream, open] = (await getGlobalClient().execute(useInvalidStream())) as any

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

    const command = useStream({}, { abort: controller.signal })
    const [error, stream, open] = (await getGlobalClient().execute(command)) as any

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

    const command = useStream({}, { abort: controller.signal })
    const [error, stream] = (await getGlobalClient().execute(command)) as any

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

    const [error, stream, open] = (await getGlobalClient().execute(useStream())) as any

    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(500)
    expect(error?.kind).toBe('http')
    expect(error?.code).toBe('HTTP_STATUS')
  })

  test('should skip unknown event types without default schema', async () => {
    const useStream = defineEventStream({
      events: {
        message: struct.string(),
      },
      path: '/sse/unknown-event',
    })

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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

  test('should parse message with empty event name', async () => {
    const useStream = defineEventStream({
      events: {
        message: struct.string(),
        default: struct.string(),
      },
      path: '/sse/no-event-name',
    })

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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

    const command = useStream({}, { abort: controller.signal })
    const [error, stream, open] = (await getGlobalClient().execute(command)) as any

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

    const [error, stream, open] = (await getGlobalClient().execute(useStream({}))) as any

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

    const [error, stream, open] = (await getGlobalClient().execute(useStream())) as any

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

    const [error, stream, open] = (await client.execute(useStream())) as any

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

    const [error, stream] = (await client.execute(useStream())) as any

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
    expect(firstInvalidEvent.reason).toBe('missing-schema')
  })

  test('should invoke onInvalidEvent for schema validation failures', async () => {
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

    const [error, stream] = (await client.execute(useStream())) as any

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

  test('should include message id in onInvalidEvent for missing-schema', async () => {
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

    const [error, stream] = (await client.execute(useStream())) as any

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    for await (const _ of stream) {
      // no events should be yielded
    }

    expect(captured).toEqual([{ id: '42', reason: 'missing-schema' }])
  })

  test('should include empty id in onInvalidEvent for missing-schema', async () => {
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

    const [error, stream] = (await client.execute(useStream())) as any

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }

    for await (const _ of stream) {
      // no events should be yielded
    }

    expect(captured).toEqual([{ id: '', reason: 'missing-schema' }])
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

    const [error, stream] = (await client.execute(useStream())) as any

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

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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

    const [error, stream] = (await client.execute(useStream())) as any

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

    const [error, stream, open] = (await getGlobalClient().execute(
      useStream(
        // @ts-expect-error testing runtime defensive behavior with invalid input type
        { id: 'invalid' },
      ),
    )) as any

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })
})
