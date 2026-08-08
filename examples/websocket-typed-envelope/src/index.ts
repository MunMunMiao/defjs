import {
  createClient,
  defineWebSocket,
  struct,
  type Client,
  type WebSocketIncomingData,
  withEndpoint,
  withWebSocketHandle,
} from '@defjs/core'
import { createEnvelopeFixture } from './fixture'

// Step 1: Constrain support replies, acknowledgements, and closure notices at the WebSocket boundary.
const caseChatIncoming = {
  'case-closed': struct.object({ caseId: struct.string(), reason: struct.string() }),
  'reply-recorded': struct.object({ messageId: struct.string(), text: struct.string() }),
}
const caseChatOutgoing = {
  'post-reply': struct.object({ agentId: struct.string(), text: struct.string() }),
}
export type CaseChatEvent = WebSocketIncomingData<typeof caseChatIncoming>
export const caseChat = defineWebSocket({
  path: '/v1/support/cases/case-842/chat',
  incoming: caseChatIncoming,
  outgoing: caseChatOutgoing,
})

// Step 2: Own send, typed acknowledgement, and terminal cleanup as one reply operation.
export async function postCaseReply(client: Client, agentId: string, text: string) {
  const [error, session] = await client.execute(caseChat())
  if (error) throw error

  try {
    session.send({ agentId, text, type: 'post-reply' })
    const next = await session.receive[Symbol.asyncIterator]().next()
    if (next.done) throw new Error('Case chat closed before the reply was recorded')

    switch (next.value.type) {
      case 'reply-recorded':
        return next.value
      case 'case-closed':
        throw new Error(`Case ${next.value.caseId} closed before acknowledgement: ${next.value.reason}`)
      default: {
        const exhaustive: never = next.value
        throw new Error(`Unexpected case event: ${JSON.stringify(exhaustive)}`)
      }
    }
  } finally {
    session.close(1000, 'reply recorded')
    await session.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Capture the outgoing frame and answer with a typed acknowledgement.
  let sent: unknown
  const WebSocketImpl = createEnvelopeFixture((socket) => {
    socket.onSend = (text) => {
      sent = JSON.parse(text) as unknown
      socket.message({ messageId: 'msg-17', text: 'Package located', type: 'reply-recorded' })
    }
    socket.open()
  })

  // Step 4: Post the support reply through the owned WebSocket operation.
  const client = createClient(withEndpoint('https://support.invalid'), withWebSocketHandle(WebSocketImpl))
  const reply = await postCaseReply(client, 'agent-7', 'Package located')

  // Step 5: Emit the sent envelope and validated acknowledgement.
  console.log(JSON.stringify({ reply, sent }))
}

if (import.meta.main) {
  await main()
}
