import { createClient, withEndpoint, withSSEHandle } from '../client'
import { struct } from '../struct'
import type { EventStreamData, EventStreamRef, StreamAwaitResult, UseEventStreamConfig } from './index'
import { defineEventStream } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const events = {
  default: struct.object({
    raw: struct.boolean(),
  }),
  joined: struct.object({
    roomId: struct.string(),
    userId: struct.number(),
  }),
  message: struct.object({
    text: struct.string(),
  }),
}

const useRequiredStream = defineEventStream({
  events,
  input: struct.object({
    roomId: struct.string(),
  }),
  path: '/events',
})

const requestInputStream = defineEventStream({
  build(request, input) {
    request.setPathParams({ id: input.path.id })
    request.setQueryParams({ include: input.query.include })
    request.setHeaders({ 'x-token': input.headers.token })

    // @ts-expect-error SSE schema-aware build context does not support request bodies.
    request.setJson({ id: input.path.id })

    // @ts-expect-error SSE schema-aware build context does not support request bodies.
    request.setFormData({ id: input.path.id })
  },
  events,
  input: struct.request({
    headers: struct.object({
      token: struct.string(),
    }),
    path: struct.object({
      id: struct.string(),
    }),
    query: struct.object({
      include: struct.boolean(),
    }),
  }),
  path: '/events/:id',
})

defineEventStream({
  build(request: unknown, input: unknown) {
    void request
    void input
  },
  events,
  path: '/events',
} as never)

type ExpectedEvent =
  | {
      data: {
        roomId: string
        userId: number
      }
      event: 'joined'
      id?: string
      retry?: number
    }
  | {
      data: {
        text: string
      }
      event: 'message'
      id?: string
      retry?: number
    }
  | {
      data: {
        raw: boolean
      }
      event: string
      id?: string
      retry?: number
    }

type EventCases = Expect<Equal<EventStreamData<typeof events>, ExpectedEvent>>
type RefCases = Expect<Equal<ReturnType<typeof useRequiredStream>, EventStreamRef<ExpectedEvent>>>
type AwaitCases = Expect<Equal<Awaited<ReturnType<typeof useRequiredStream>>, StreamAwaitResult<ExpectedEvent>>>
type InputCases = Expect<Equal<Parameters<typeof useRequiredStream>, [({ roomId?: string | undefined } | undefined)?]>>

const streamRef = useRequiredStream({ roomId: 'room-1' })
const streamClient = createClient(withEndpoint('https://api.example.com'), withSSEHandle(globalThis.fetch))

streamRef.with({ timeout: 100 })
streamRef.with({ abort: new AbortController().signal })
streamRef.with({ abort: AbortSignal.timeout(100) })
streamRef.with({ client: streamClient })

const streamTimeoutConfig = { timeout: 100 } satisfies UseEventStreamConfig
const streamAbortConfig = { abort: new AbortController().signal } satisfies UseEventStreamConfig
void streamTimeoutConfig
void streamAbortConfig

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
streamRef.with({ abort: new AbortController().signal, timeout: 100 })

// @ts-expect-error request-level fetch was removed; configure fetch on client.sse and pass client.
streamRef.with({ fetch: globalThis.fetch })

// @ts-expect-error abort must be an AbortSignal.
streamRef.with({ abort: true })

// @ts-expect-error abort must be an AbortSignal, not an AbortController.
streamRef.with({ abort: new AbortController() })

streamRef.with({
  // @ts-expect-error abort must be an AbortSignal, not a callback.
  abort: () => {
    void 0
  },
})

function assertRequiredStreamEvent(event: EventStreamData<typeof events>) {
  if (event.event === 'message' && 'text' in event.data) {
    const data: {
      text: string
    } = event.data

    void data
  }
}

declare const anyStreamEvent: EventStreamData<typeof events>

assertRequiredStreamEvent(anyStreamEvent)
void requestInputStream
void streamRef

export type Cases = AwaitCases | EventCases | InputCases | RefCases
