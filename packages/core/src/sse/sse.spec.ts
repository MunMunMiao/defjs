import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, restGlobalClient, setGlobalClient } from '../client'
import { schema } from '../schema'
import { defineEventStream } from './index'

describe('request event stream runtime', () => {
  beforeEach(() => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
      }),
    )
  })

  afterEach(() => {
    restGlobalClient()
  })

  test('should resolve event streams through thenable refs', async () => {
    const useBasicStream = defineEventStream({
      events: {
        message: schema.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream, open] = await useBasicStream()

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

  test('should support default event schema parsing with request-level fetch override', async () => {
    const encoder = new TextEncoder()
    const fakeFetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('event: userconnect\ndata: {"uid":1}\n\n' + 'event: something-else\ndata: {"note":"fallback"}\n\n'),
            )
            controller.close()
          },
        }),
        {
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
          },
        },
      )) as unknown as typeof fetch

    const useMixedStream = defineEventStream({
      events: {
        default: schema.object({
          note: schema.string(),
        }),
        userconnect: schema.object({
          uid: schema.number(),
        }),
      },
      path: '/events',
    })

    const [error, stream] = await useMixedStream().with({
      client: createClient({
        endpoint: 'https://example.com',
      }),
      fetch: fakeFetch,
    })

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

  test('should allow closing stream refs before startup', async () => {
    const useStream = defineEventStream({
      events: {
        message: schema.string(),
      },
      path: '/sse/infinite',
    })
    const ref = useStream()

    ref.close('stop')

    const [error, stream, open] = await ref

    expect(stream).toBeUndefined()
    expect(open).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (!error || error.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('ABORTED')
  })

  test('should skip unexpected stream messages after startup', async () => {
    const useStream = defineEventStream({
      events: {
        message: schema.number(),
      },
      path: '/sse/basic',
    })
    const ref = useStream()

    const [error, stream] = await ref

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
    expect(ref.status).toBe('closed')
    expect(ref.error).toBeUndefined()
  })

  test('should return startup error tuple when stream open response is invalid', async () => {
    const useInvalidStream = defineEventStream({
      events: {
        message: schema.string(),
      },
      path: '/json',
    })

    const [error, stream, open] = await useInvalidStream()

    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(200)
    expect(error?.kind).toBe('definition')

    if (!error || error.kind !== 'definition') {
      throw new Error('Expected definition error')
    }

    expect(error.code).toBe('RESPONSE_VALIDATION_FAILED')
  })
})
