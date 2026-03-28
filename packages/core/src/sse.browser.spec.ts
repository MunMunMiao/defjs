import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, restGlobalClient, setGlobalClient } from './client'
import { defineEventStream } from './index'
import { schema } from './schema'

describe('sse browser runtime', () => {
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

  test('should consume event streams in real browsers', async () => {
    const useBasicStream = defineEventStream({
      events: {
        message: schema.string(),
      },
      path: '/sse/basic',
    }).use

    const [error, stream, open] = await useBasicStream()

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

  test('should skip unexpected events in real browsers', async () => {
    const [error, stream] = await defineEventStream({
      events: {
        message: schema.number(),
      },
      path: '/sse/basic',
    }).use()

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
