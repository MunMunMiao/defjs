import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, getGlobalClient, resetGlobalClient, setGlobalClient, withEndpoint } from '../client'
import { struct } from '../struct'
import { defineEventStream } from './index'

describe('sse browser runtime', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should consume event streams in real browsers', async () => {
    const useBasicStream = defineEventStream({
      events: {
        message: struct.string(),
      },
      path: '/sse/basic',
    })

    const [error, stream, open] = (await getGlobalClient().execute(useBasicStream())) as any

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
    const useStream = defineEventStream({
      events: {
        message: struct.number(),
      },
      path: '/sse/basic',
    })

    const [error, stream] = (await getGlobalClient().execute(useStream())) as any

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
