import { createClient, defineEventStream, struct, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'

// Step 1: Type shipment status events and their path before cursor-backed replay.
export const shipmentEvents = defineEventStream({
  maxBufferSize: 1024,
  maxQueueSize: 8,
  path: '/v1/shipments/:shipmentId/events',
  input: struct.request({ path: struct.object({ shipmentId: struct.string() }) }),
  events: {
    'shipment-status': struct.json(struct.object({ shipmentId: struct.string(), state: struct.string() })),
  },
})

// Step 2: Permit one reconnect only after Defjs has retained a non-empty event ID.
function createShipmentClient(handle: typeof fetch) {
  return createClient(
    withEndpoint('https://shipping.invalid'),
    withSSEHandle(handle),
    withSSEReconnect({
      attempts: 1,
      delayMs: 0,
      shouldReconnect: ({ lastEventId }) => lastEventId !== '',
    }),
  )
}

// Step 3: Own the logical feed across replay and settle it after collecting ordered states.
export async function followShipment(client: ReturnType<typeof createShipmentClient>, shipmentId: string): Promise<string[]> {
  const [error, stream] = await client.execute(shipmentEvents({ path: { shipmentId } }))
  if (error) throw error

  const states: string[] = []
  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'shipment-status':
          states.push(event.data.state)
          break
      }
    }
    return states
  } finally {
    stream.close('shipment feed complete')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 4: Emit cursor 17, disconnect, then serve cursor 18 on replay.
  const encoder = new TextEncoder()
  const disconnect = (chunk?: string) => {
    let pending = chunk
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pending !== undefined) {
          controller.enqueue(encoder.encode(pending))
          pending = undefined
        } else {
          controller.error(new Error('shipment feed disconnected'))
        }
      },
    })
  }
  let replayHeader: string | null = null
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const cursor = request.headers.get('last-event-id')
    if (cursor) {
      replayHeader = cursor
      return new Response('id: shipment-104:18\nevent: shipment-status\ndata: {"shipmentId":"shipment-104","state":"in-transit"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    return new Response(
      disconnect('id: shipment-104:17\nevent: shipment-status\ndata: {"shipmentId":"shipment-104","state":"packed"}\n\n'),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }

  // Step 5: Follow the shipment across the single cursor-backed reconnect.
  const client = createShipmentClient(fixtureFetch)
  const states = await followShipment(client, 'shipment-104')

  // Step 6: Emit both states and the replay header observed by Fetch.
  console.log(JSON.stringify({ replayHeader, states }))
}

if (import.meta.main) {
  await main()
}
