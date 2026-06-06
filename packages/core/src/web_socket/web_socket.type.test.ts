import { struct } from '../struct'
import {
  defineWebSocket,
  type UseWebSocketConfig,
  type WebSocketIncomingData,
  type WebSocketOutgoingData,
  type WebSocketRef,
  type WebSocketSession,
} from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const incomingSchemas = {
  default: struct.object({
    raw: struct.string(),
  }),
  joined: struct.object({
    roomId: struct.string(),
    userId: struct.number(),
  }),
}

const outgoingSchemas = {
  message: struct.object({
    text: struct.string(),
  }),
}

const useSocket = defineWebSocket({
  incoming: incomingSchemas,
  input: struct.object({
    roomId: struct.string(),
  }),
  outgoing: outgoingSchemas,
  path: '/ws/chat',
})

const requestInputSocket = defineWebSocket({
  build(request, input) {
    request.setPathParams({ roomId: input.path.roomId })
    request.setQueryParams({ include: input.query.include })

    // @ts-expect-error WebSocket schema-aware build context does not support headers.
    request.setHeaders({ 'x-token': input.query.include })

    // @ts-expect-error WebSocket schema-aware build context does not support request bodies.
    request.setJson({ include: input.query.include })
  },
  incoming: incomingSchemas,
  input: struct.request({
    path: struct.object({
      roomId: struct.string(),
    }),
    query: struct.object({
      include: struct.boolean(),
    }),
  }),
  outgoing: outgoingSchemas,
  path: '/ws/:roomId',
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
      text?: string | undefined
      type: 'message'
    }
  | {
      data: {
        text?: string | undefined
      }
      type: 'message'
    }

type IncomingCases = Expect<Equal<WebSocketIncomingData<typeof incomingSchemas>, ExpectedIncoming>>

type OutgoingCases = Expect<Equal<WebSocketOutgoingData<typeof outgoingSchemas>, ExpectedOutgoing>>
type RefCases = Expect<Equal<ReturnType<typeof useSocket>, WebSocketRef<ExpectedIncoming, ExpectedOutgoing>>>
type InputCases = Expect<Equal<Parameters<typeof useSocket>, [({ roomId?: string | undefined } | undefined)?]>>

const socketRef = useSocket({ roomId: 'room-1' })

socketRef.with({ timeout: 100 })
socketRef.with({ abort: new AbortController().signal })
socketRef.with({ abort: AbortSignal.timeout(100) })
socketRef.with({
  heartbeat: {
    intervalMs: 1000,
    isAck: message => message.type === 'joined',
    message: () => ({ text: 'hello', type: 'message' }),
  },
})

const socketTimeoutConfig = { timeout: 100 } satisfies UseWebSocketConfig<ExpectedIncoming, ExpectedOutgoing>
const socketAbortConfig = { abort: new AbortController().signal } satisfies UseWebSocketConfig<ExpectedIncoming, ExpectedOutgoing>
void socketTimeoutConfig
void socketAbortConfig

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
socketRef.with({ abort: new AbortController().signal, timeout: 100 })

// @ts-expect-error abort must be an AbortSignal.
socketRef.with({ abort: true })

// @ts-expect-error abort must be an AbortSignal, not an AbortController.
socketRef.with({ abort: new AbortController() })

socketRef.with({
  // @ts-expect-error abort must be an AbortSignal, not a callback.
  abort: () => {
    void 0
  },
})

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
void requestInputSocket
void socketRef

export type Cases = IncomingCases | InputCases | OutgoingCases | RefCases
