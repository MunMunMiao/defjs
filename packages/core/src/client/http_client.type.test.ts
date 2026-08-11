import { defineEventStream } from '../sse'
import { struct } from '../struct'
import { createHttpClient } from './http_client'
import { withEndpoint, withSSEHandle } from './option'

createHttpClient(withEndpoint('https://example.test'))

// @ts-expect-error HTTP-only clients reject SSE-specific configuration
createHttpClient(withSSEHandle(fetch))

const events = defineEventStream({
  maxBufferSize: 1_024,
  maxQueueSize: 1,
  path: '/events',
  events: { message: struct.string() },
})

// @ts-expect-error HTTP-only clients execute only HTTP commands
createHttpClient().execute(events())
