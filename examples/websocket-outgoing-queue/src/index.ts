import {
  createClient,
  defineWebSocket,
  struct,
  type WebSocketOutgoingData,
  type WebSocketSession,
  withEndpoint,
  withWebSocketHandle,
  withWebSocketReconnect,
} from '@defjs/core'
import { createQueueFixture } from './fixture'

// Step 1: Type pick confirmations before they enter the disconnected WebSocket outbox.
const pickConfirmationMessages = {
  'confirm-pick': struct.object({ pickId: struct.string(), sequence: struct.number() }),
}
export type PickConfirmation = WebSocketOutgoingData<typeof pickConfirmationMessages>
export const pickConfirmations = defineWebSocket({
  maxIncomingQueueSize: 16,
  maxOutgoingQueueSize: 2,
  path: '/v1/warehouses/wh-7/picks',
  incoming: { acknowledged: struct.object({ pickId: struct.string(), sequence: struct.number() }) },
  outgoing: pickConfirmationMessages,
})

// Step 2: Keep each confirmation caller-owned so queue overflow is thrown at the send boundary.
export function confirmPick(session: WebSocketSession<unknown, PickConfirmation>, pickId: string, sequence: number): void {
  session.send({ pickId, sequence, type: 'confirm-pick' })
}

export async function main(): Promise<void> {
  // Step 3: Create a reconnect fixture whose replacement waits at the queue barrier.
  const fixture = createQueueFixture(({ attempt, socket }) => {
    if (attempt === 1) socket.open()
  })

  // Step 4: Acquire the session and enqueue confirmations during reconnect.
  const client = createClient(
    withEndpoint('https://warehouse.invalid'),
    withWebSocketHandle(fixture.WebSocket),
    withWebSocketReconnect({ attempts: 1, delayMs: 0 }),
  )
  const [error, session] = await client.execute(pickConfirmations())
  if (error) throw error

  const flushed: PickConfirmation[] = []
  let overflow: string | undefined
  try {
    const first = await fixture.connection(1)
    first.socket.serverClose(1012, 'warehouse gateway restart', false)
    const replacement = await fixture.connection(2)
    replacement.socket.onSend = (text) => flushed.push(JSON.parse(text) as PickConfirmation)
    confirmPick(session, 'pick-101', 1)
    confirmPick(session, 'pick-102', 2)
    try {
      confirmPick(session, 'pick-103', 3)
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause
      overflow = cause.message
    }
    replacement.socket.open()
  } finally {
    // Step 5: Close the logical session and await terminal cleanup.
    session.close(1000, 'pick queue complete')
    await session.closed
  }

  // Step 6: Emit the FIFO-flushed frames and explicit overflow error.
  console.log(JSON.stringify({ flushed, overflow }))
}

if (import.meta.main) {
  await main()
}
