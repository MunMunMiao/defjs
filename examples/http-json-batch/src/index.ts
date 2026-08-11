import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Give each invoice or shipment child read an identity inside one typed batch envelope.
export type OrderBatchRead = Readonly<{
  id: string
  orderId: string
  resource: 'invoice' | 'shipment'
}>
const batchChildResponse = struct.discriminatedUnion('status', [
  struct.object({
    id: struct.string(),
    status: struct.literal(200),
    body: struct.object({ state: struct.string() }),
  }),
  struct.object({
    id: struct.string(),
    status: struct.literal(404),
    body: struct.object({ code: struct.literal('order_resource_not_found') }),
  }),
])

export const readOrderBatch = defineRequest({
  method: 'POST',
  path: '/batch',
  input: struct.request({
    body: struct.json(
      struct.object({
        requests: struct.array(struct.object({ id: struct.string(), method: struct.literal('GET'), url: struct.string() })),
      }),
    ),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        responses: struct.array(batchChildResponse),
      }),
    },
  ],
})

// Step 2: Require unique child IDs and restore caller order from correlation, never array position.
export async function executeOrderReads(client: Client, requests: readonly OrderBatchRead[]) {
  const ids = requests.map(({ id }) => id)
  if (new Set(ids).size !== ids.length) throw new TypeError('batch read IDs must be unique')

  const children = requests.map(({ id, orderId, resource }) => ({
    id,
    method: 'GET' as const,
    url: `/orders/${encodeURIComponent(orderId)}/${resource}`,
  }))
  const [error, result, response] = await client.execute(readOrderBatch({ body: { requests: children } }))
  if (error) throw error
  if (response.error) throw response.error

  const byId = new Map(result.responses.map((child) => [child.id, child]))
  return ids.map((id) => {
    const child = byId.get(id)
    if (!child) throw new Error(`batch response omitted child ${id}`)

    switch (child.status) {
      case 200:
        return { id, state: child.body.state }
      case 404:
        throw new Error(`batch child ${id} failed with ${child.body.code}`)
      default: {
        const exhaustive: never = child
        throw new Error(`unexpected batch child ${JSON.stringify(exhaustive)}`)
      }
    }
  })
}

export async function main(): Promise<void> {
  // Step 3: Reverse the local batch responses while preserving each child ID.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const body = (await new Request(input, init).json()) as {
      requests: Array<{ id: string; url: string }>
    }
    const responses = [...body.requests].reverse().map(({ id, url }) => ({
      id,
      status: 200,
      body: { state: url.endsWith('/invoice') ? 'issued' : 'packed' },
    }))
    return new Response(JSON.stringify({ responses }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Execute the invoice and shipment reads as one typed batch.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const orders = await executeOrderReads(client, [
    { id: 'invoice', orderId: 'order-2048', resource: 'invoice' },
    { id: 'shipment', orderId: 'order-2048', resource: 'shipment' },
  ])

  // Step 5: Emit results restored to the caller's requested order.
  console.log(JSON.stringify(orders))
}

if (import.meta.main) {
  await main()
}
