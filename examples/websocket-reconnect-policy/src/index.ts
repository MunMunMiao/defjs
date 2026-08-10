import { createClient, defineWebSocket, struct, type Client, withEndpoint, withWebSocketHandle, withWebSocketReconnect } from '@defjs/core'
import { createReconnectFixture } from './fixture'

// Step 1: Type inventory readiness for one fulfillment-center logical session.
export const inventoryAvailability = defineWebSocket({
  maxIncomingQueueSize: 8,
  path: '/v1/fulfillment-centers/:centerId/inventory',
  input: struct.request({ path: struct.object({ centerId: struct.string() }) }),
  incoming: {
    'inventory-ready': struct.object({ centerId: struct.string(), status: struct.string() }),
  },
})

// Step 2: Consume across reviewed replacement attempts and close after the first validated result.
export async function readInventoryAvailability(client: Client, centerId: string) {
  const [error, session] = await client.execute(inventoryAvailability({ path: { centerId } }))
  if (error) throw error

  try {
    const next = await session.receive[Symbol.asyncIterator]().next()
    return next.done ? null : next.value
  } finally {
    session.close(1000, 'inventory result received')
    await session.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Close the first socket with 1012 and serve readiness on its replacement.
  const fixture = createReconnectFixture(({ attempt, socket }) => {
    socket.open()
    queueMicrotask(() => {
      if (attempt === 1) socket.serverClose(1012, 'service restart', false)
      else socket.message({ centerId: 'fc-recovered', status: 'available', type: 'inventory-ready' })
    })
  })

  // Step 4: Read availability through the one-reconnect reviewed policy.
  const client = createClient(
    withEndpoint('https://fulfillment.invalid'),
    withWebSocketHandle(fixture.WebSocket),
    withWebSocketReconnect({
      attempts: 1,
      delayMs: 0,
      shouldReconnect: ({ code }) => code === 1012 || code === 1013,
    }),
  )
  const availability = await readInventoryAvailability(client, 'fc-recovered')

  // Step 5: Emit physical attempt count and validated availability.
  console.log(JSON.stringify({ attempts: fixture.attempts, availability }))
}

if (import.meta.main) {
  await main()
}
