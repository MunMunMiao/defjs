import { schema } from '../schema'
import { defineEventStream, type EventStreamData, type EventStreamRef, type StreamAwaitResult } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const events = {
  default: schema.object({
    raw: schema.boolean(),
  }),
  joined: schema.object({
    roomId: schema.string(),
    userId: schema.number(),
  }),
  message: schema.object({
    text: schema.string(),
  }),
}

const useRequiredStream = defineEventStream({
  events,
  input: schema.object({
    roomId: schema.string(),
  }),
  path: '/events',
})

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
type InputCases = Expect<Equal<Parameters<typeof useRequiredStream>, [({ roomId?: string } | undefined)?]>>

function assertRequiredStreamEvent(event: EventStreamData<typeof events>) {
  if (event.event === 'message') {
    const data: {
      text: string
    } = event.data

    void data
  }
}

declare const anyStreamEvent: EventStreamData<typeof events>

assertRequiredStreamEvent(anyStreamEvent)

export type Cases = AwaitCases | EventCases | InputCases | RefCases
