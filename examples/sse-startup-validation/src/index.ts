import { createClient, defineEventStream, struct, type Infer, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'

// Step 1: Require the order-status shape only after an SSE-valid response opens.
const packedOrderStruct = struct.object({ orderId: struct.string(), state: struct.literal('packed') })
type PackedOrder = Infer<typeof packedOrderStruct>
export const orderStatusEvents = defineEventStream({
  maxBufferSize: 1024,
  maxQueueSize: 8,
  path: '/v1/orders/order-741/status',
  events: {
    'order-status': struct.json(packedOrderStruct),
  },
})

// Step 2: Enable bounded retry while keeping invalid startup responses fatal.
function createOrderStatusClient(handle: typeof fetch) {
  return createClient(withEndpoint('https://fulfillment.invalid'), withSSEHandle(handle), withSSEReconnect({ attempts: 2, delayMs: 1 }))
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
  // Step 4: Count one invalid JSON startup followed by one valid finite SSE feed.
  let requests = 0
  const responses = [
    new Response('{"state":"packed"}', { headers: { 'content-type': 'application/json' } }),
    new Response('event: order-status\ndata: {"orderId":"order-741","state":"packed"}\n\n', {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    }),
  ]
  const fixtureFetch: typeof fetch = async () => {
    requests += 1
    return responses.shift() ?? Promise.reject(new Error('Fixture exhausted'))
  }

  // Step 5: Prove the fatal handshake was not retried, then consume the typed order event.
  const client = createOrderStatusClient(fixtureFetch)
  const [startupError] = await client.execute(orderStatusEvents())
  if (requests !== 1) throw new Error(`Expected one rejected startup request, received ${requests}`)
  const order = await waitForPackedOrder(client)

  // Step 6: Emit the startup validation code, validated order, and total request count.
  console.log(JSON.stringify({ order, rejectedStartup: startupError?.code, requests }))
}

if (import.meta.main) {
  await main()
}
