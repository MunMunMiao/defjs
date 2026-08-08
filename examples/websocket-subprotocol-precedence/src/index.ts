import { createClient, defineWebSocket, struct, type Client, withEndpoint, withWebSocketHandle, withWebSocketProtocols } from '@defjs/core'
import { createProtocolFixture } from './fixture'

// Step 1: Define the endpoint fallback protocol without weakening the stock message schema.
export const inventoryUpdates = defineWebSocket({
  path: '/v1/warehouses/wh-7/inventory',
  protocols: ['inventory.v1'],
  incoming: { 'stock-changed': struct.object({ sku: struct.string(), units: struct.number() }) },
})

// Step 2: Require inventory.v3 at execution scope and await session closure after negotiation.
export async function negotiateInventoryRollout(client: Client) {
  const [error, session, connection] = await client.execute(inventoryUpdates(), {
    protocols: ['inventory.v3'],
  })
  if (error) throw error

  try {
    return connection.protocol
  } finally {
    session.close(1000, 'protocol selected')
    await session.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Record the native protocol offer and select inventory.v3 locally.
  const fixture = createProtocolFixture('inventory.v3')

  // Step 4: Execute the rollout with request-level protocol precedence.
  const client = createClient(
    withEndpoint('https://inventory.invalid'),
    withWebSocketHandle(fixture.WebSocket),
    withWebSocketProtocols(['inventory.v2']),
  )
  const negotiatedProtocol = await negotiateInventoryRollout(client)

  // Step 5: Emit the sole offered protocol and negotiated value.
  console.log(JSON.stringify({ negotiatedProtocol, offeredProtocols: fixture.offeredProtocols }))
}

if (import.meta.main) {
  await main()
}
