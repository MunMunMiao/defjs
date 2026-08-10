import { beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, withEndpoint } from '../client'
import type { Client } from '../client'
import { struct } from '../struct'
import { defineEventStream } from './index'

describe('sse browser runtime', () => {
  let baseClient: Client

  beforeEach(() => {
    baseClient = createClient(withEndpoint(inject('testServerHost')))
  })

  test('should consume event streams in real browsers', async () => {
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
    expect(open?.response?.ok).toBe(true)
    if (!stream) {
      throw new Error('Expected event stream')
    }

    const events: string[] = []
    for await (const event of stream) {
      events.push(event.data)
    }

    expect(events).toEqual(['first', 'second line 1\nsecond line 2'])
    await expect(stream.closed).resolves.toEqual({ code: 'eof' })
  })

  test('should return the fixed error tuple for non-2xx open responses in real browsers', async () => {
    const useFailedStream = defineEventStream({
      maxBufferSize: 1024,
      maxQueueSize: 16,
      events: {
        message: struct.string(),
      },
      path: '/500',
    })

    const [error, stream, open] = await baseClient.execute(useFailedStream())

    expect(error?.kind).toBe('http')
    expect(error?.code).toBe('HTTP_STATUS')
    expect(stream).toBeUndefined()
    expect(open?.response?.status).toBe(500)
    expect(open?.response?.error).toBeUndefined()
  })

  test('should skip unexpected events in real browsers', async () => {
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
      throw new Error('Expected event stream')
    }

    const events: unknown[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([])
  })
})
