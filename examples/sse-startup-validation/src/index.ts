import { createClient, defineEventStream, struct, type Infer, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'

// Step 1: Require the order-status shape only after an SSE-valid response opens.
const packedOrderStruct = struct.object({ orderId: struct.string(), state: struct.literal('packed') })
type PackedOrder = Infer<typeof packedOrderStruct>
export const orderStatusEvents = defineEventStream({
  path: '/v1/orders/order-741/status',
  events: {
    'order-status': struct.json(packedOrderStruct),
  },
})

// Step 2: Disable startup retry so an invalid media type remains a visible handshake failure.
function createOrderStatusClient(handle: typeof fetch) {
  return createClient(withEndpoint('https://fulfillment.invalid'), withSSEHandle(handle), withSSEReconnect({ attempts: 0 }))
}

// Step 3: Transfer stream ownership only after validation, then close after the packed event.
export async function waitForPackedOrder(client: ReturnType<typeof createOrderStatusClient>): Promise<PackedOrder> {
  const [error, stream] = await client.execute(orderStatusEvents())
  if (error) throw error

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'order-status':
          return event.data
      }
    }
    throw new Error('Order status stream ended before a packed event arrived')
  } finally {
    stream.close('packed order received')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 4: Queue one invalid JSON startup followed by one valid finite SSE feed.
  const responses = [
    new Response('{"state":"packed"}', { headers: { 'content-type': 'application/json' } }),
    new Response('event: order-status\ndata: {"orderId":"order-741","state":"packed"}\n\n', {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    }),
  ]
  const fixtureFetch: typeof fetch = async () => responses.shift() ?? Promise.reject(new Error('Fixture exhausted'))

  // Step 5: Reject the first handshake, then consume the typed order event.
  const client = createOrderStatusClient(fixtureFetch)
  const [startupError] = await client.execute(orderStatusEvents())
  const order = await waitForPackedOrder(client)

  // Step 6: Emit the startup validation code and validated packed order.
  console.log(JSON.stringify({ order, rejectedStartup: startupError?.code }))
}

if (import.meta.main) {
  await main()
}
