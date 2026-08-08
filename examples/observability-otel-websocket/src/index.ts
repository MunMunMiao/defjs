import { createClient, defineWebSocket, struct, type Client, withEndpoint, withWebSocketHandle } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { createInventoryWebSocketFixture } from './fixture'
import { createTelemetryFixture } from './telemetry'

// Step 1: Admit only typed stock messages from the warehouse inventory session.
export const inventoryUpdates = defineWebSocket({
  path: '/v1/warehouses/sea-1/inventory',
  incoming: {
    stock: struct.object({ available: struct.number(), sku: struct.string() }),
  },
})

// Step 2: Give the snapshot operation ownership of receive, close, and terminal session state.
export async function readInventorySnapshot(client: Client) {
  const [error, session] = await client.execute(inventoryUpdates())
  if (error) throw error
  try {
    const next = await session.receive[Symbol.asyncIterator]().next()
    if (next.done) throw new Error('inventory socket closed before a stock message')
    return { available: next.value.available, sku: next.value.sku }
  } finally {
    session.close(1000, 'inventory snapshot received')
    await session.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Create the deterministic local inventory WebSocket fixture.
  const fixture = createInventoryWebSocketFixture()

  // Step 4: Create isolated telemetry and execute the inventory read with WebSocket query propagation disabled.
  const telemetry = createTelemetryFixture()

  try {
    const client = createClient(
      withEndpoint('https://inventory.invalid'),
      withWebSocketHandle(fixture.WebSocket),
      withOpenTelemetryServer({
        http: { enabled: false },
        meter: telemetry.meter,
        propagator: telemetry.propagator,
        sse: { enabled: false },
        tracer: telemetry.tracer,
        webSocket: { queryPropagation: false },
      }),
    )

    const message = await readInventorySnapshot(client)
    const span = telemetry.exporter.getFinishedSpans()[0]
    if (!span) throw new Error('WebSocket span did not finish')

    // Step 5: Emit the validated message, clean socket URL, and finished span.
    console.log(
      JSON.stringify({
        message,
        socketUrl: fixture.connectionUrl,
        span: { events: span.events.map(({ name }) => name), name: span.name },
      }),
    )
  } finally {
    // Step 6: Shut down both local providers after session closure.
    await telemetry.shutdown()
  }
}

if (import.meta.main) {
  await main()
}
