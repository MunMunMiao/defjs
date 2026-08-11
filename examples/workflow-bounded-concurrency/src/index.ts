import { createClient, defineRequest, struct, type Client, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Type each fulfillment result before it enters an index-owned batch slot.
const MAX_ACTIVE_READS = 2
const fulfillmentStruct = struct.object({
  orderId: struct.string(),
  state: struct.enum(['picking', 'packed', 'shipped']),
})
type Fulfillment = Infer<typeof fulfillmentStruct>
export const readOrderFulfillment = defineRequest({
  method: 'GET',
  path: '/orders/:orderId/fulfillment',
  input: struct.request({ path: struct.object({ orderId: struct.string() }) }),
  output: [
    {
      status: 200,
      body: fulfillmentStruct,
    },
  ],
})

// Step 2: Cap active reads with two workers while preserving caller order by index.
export async function readFulfillments(client: Client, orderIds: readonly string[]): Promise<Fulfillment[]> {
  const results = new Array<Fulfillment>(orderIds.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < orderIds.length) {
      const index = nextIndex
      nextIndex += 1
      const orderId = orderIds[index]
      if (orderId === undefined) return

      const [error, fulfillment, response] = await client.execute(readOrderFulfillment({ path: { orderId } }))
      if (error) throw error
      if (response.error) throw response.error
      results[index] = fulfillment
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_ACTIVE_READS, orderIds.length) }, worker))
  return results
}

export async function main(): Promise<void> {
  // Step 3: Hold the first request until a worker starts the third order.
  const releaseFirst = Promise.withResolvers<void>()
  let active = 0
  let maxActive = 0
  const states: Record<string, Fulfillment['state']> = {
    'order-1042': 'packed',
    'order-1043': 'shipped',
    'order-1044': 'picking',
  }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const orderId = decodeURIComponent(new URL(new Request(input, init).url).pathname.split('/')[2] ?? '')
    const state = states[orderId]
    if (state === undefined) throw new Error('fixture received an unknown order')

    active += 1
    maxActive = Math.max(maxActive, active)
    try {
      if (orderId === 'order-1042') await releaseFirst.promise
      if (orderId === 'order-1044') releaseFirst.resolve()
      return Response.json({ orderId, state })
    } finally {
      active -= 1
    }
  }

  // Step 4: Read all fulfillments through the fixed two-worker scheduler.
  const client = createClient(withEndpoint('https://fulfillment.invalid'), withHTTPHandle(fixtureFetch))
  const results = await readFulfillments(client, ['order-1042', 'order-1043', 'order-1044'])

  // Step 5: Emit input-ordered results and the observed active-request maximum.
  console.log(JSON.stringify({ results, maxActive }))
}

if (import.meta.main) {
  await main()
}
