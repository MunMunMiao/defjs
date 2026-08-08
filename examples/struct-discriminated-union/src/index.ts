import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Select packed and delayed fulfillment shapes by literal type before business access.
export const readFulfillmentEvent = defineRequest({
  method: 'GET',
  path: '/fulfillment-events/:eventId',
  input: struct.request({ path: struct.object({ eventId: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.discriminatedUnion('type', [
        struct.object({
          type: struct.literal('parcel_packed'),
          orderId: struct.string(),
          parcels: struct.number(),
        }),
        struct.object({
          type: struct.literal('delivery_delayed'),
          orderId: struct.string(),
          reason: struct.string(),
        }),
      ]),
    },
  ] as const,
})

// Step 2: Summarize only fields belonging to the Struct-selected event branch.
export async function summarizeFulfillmentEvent(client: Client, eventId: string) {
  const [error, event] = await client.execute(readFulfillmentEvent({ path: { eventId } }))
  if (error) throw error

  if (event.type === 'parcel_packed') {
    return `${event.parcels} parcels packed for ${event.orderId}`
  }
  return `${event.orderId} delayed: ${event.reason}`
}

export async function main(): Promise<void> {
  // Step 3: Serve both declared fulfillment variants from one local fixture.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const eventId = new URL(new Request(input, init).url).pathname.split('/').at(-1)
    const body =
      eventId === 'evt-packed'
        ? { type: 'parcel_packed', orderId: 'order-8041', parcels: 2 }
        : { type: 'delivery_delayed', orderId: 'order-8041', reason: 'severe weather' }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Step 4: Summarize the packed and delayed events through one typed operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const summaries = await Promise.all([summarizeFulfillmentEvent(client, 'evt-packed'), summarizeFulfillmentEvent(client, 'evt-delayed')])

  // Step 5: Emit the two branch-specific summaries in request order.
  console.log(JSON.stringify(summaries))
}

if (import.meta.main) {
  await main()
}
