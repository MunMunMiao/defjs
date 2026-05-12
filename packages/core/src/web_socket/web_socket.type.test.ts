import { schema } from '../schema'
import { defineWebSocket, type WebSocketIncomingData, type WebSocketOutgoingData, type WebSocketRef, type WebSocketSession } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const incomingSchemas = {
  default: schema.object({
    raw: schema.string(),
  }),
  joined: schema.object({
    roomId: schema.string(),
    userId: schema.number(),
  }),
}

const outgoingSchemas = {
  message: schema.object({
    text: schema.string(),
  }),
}

const useSocket = defineWebSocket({
  incoming: incomingSchemas,
  input: schema.object({
    roomId: schema.string(),
  }),
  outgoing: outgoingSchemas,
  path: '/ws/chat',
})

type ExpectedIncoming =
  | {
      roomId: string
      type: 'joined'
      userId: number
    }
  | {
      raw: string
      type: string
    }

type ExpectedOutgoing =
  | {
      text: string
      type: 'message'
    }
  | {
      data: {
        text: string
      }
      type: 'message'
    }

type IncomingCases = Expect<Equal<WebSocketIncomingData<typeof incomingSchemas>, ExpectedIncoming>>
type OutgoingCases = Expect<Equal<WebSocketOutgoingData<typeof outgoingSchemas>, ExpectedOutgoing>>
type RefCases = Expect<Equal<ReturnType<typeof useSocket>, WebSocketRef<ExpectedIncoming, ExpectedOutgoing>>>
type InputCases = Expect<Equal<Parameters<typeof useSocket>, [({ roomId?: string } | undefined)?]>>

function assertSocketSession(session: WebSocketSession<ExpectedIncoming, ExpectedOutgoing>) {
  session.send({
    text: 'hello',
    type: 'message',
  })

  session.send({
    data: {
      text: 'hello',
    },
    type: 'message',
  })
}

declare const socketSession: WebSocketSession<ExpectedIncoming, ExpectedOutgoing>

assertSocketSession(socketSession)

export type Cases = IncomingCases | InputCases | OutgoingCases | RefCases
