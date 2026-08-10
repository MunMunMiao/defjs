import {
  createClient,
  defineWebSocket,
  struct,
  type Client,
  withEndpoint,
  withWebSocketBeforeConnect,
  withWebSocketHandle,
  withWebSocketReconnect,
} from '@defjs/core'
import { createPreparationFixture } from './fixture'

// Step 1: Type the readiness generation delivered by the logical dispatch-board session.
export const dispatchBoard = defineWebSocket({
  maxIncomingQueueSize: 8,
  path: '/v1/dispatch/boards/north',
  incoming: { ready: struct.object({ sessionGeneration: struct.number() }) },
})

// Step 2: Own the replacement session through one iterator and close after readiness arrives.
export async function waitForDispatchReady(client: Client) {
  const [error, session] = await client.execute(dispatchBoard())
  if (error) throw error

  try {
    const next = await session.receive[Symbol.asyncIterator]().next()
    if (next.done) throw new Error('Dispatch board closed before it was ready')
    return next.value
  } finally {
    session.close(1000, 'dispatch board ready')
    await session.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Open generation one, force a restart, and report readiness from generation two.
  let preparations = 0
  const WebSocketImpl = createPreparationFixture(({ attempt, socket }) => {
    socket.open()
    if (attempt === 1) queueMicrotask(() => socket.serverClose(1012, 'dispatch gateway restart', false))
    else socket.message({ sessionGeneration: preparations, type: 'ready' })
  })

  // Step 4: Connect with preparation and one reviewed reconnect configured.
  const client = createClient(
    withEndpoint('https://dispatch.invalid'),
    withWebSocketHandle(WebSocketImpl),
    withWebSocketBeforeConnect(async ({ attempt, signal }) => {
      signal.throwIfAborted()
      await Promise.resolve()
      preparations = attempt + 1
    }),
    withWebSocketReconnect({ attempts: 1, delayMs: 0 }),
  )
  const ready = await waitForDispatchReady(client)

  // Step 5: Emit the two preparation calls and replacement readiness message.
  console.log(JSON.stringify({ preparations, ready }))
}

if (import.meta.main) {
  await main()
}
