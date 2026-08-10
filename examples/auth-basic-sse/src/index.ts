import {
  basicAuthSSEInterceptor,
  createClient,
  defineEventStream,
  struct,
  type Client,
  withEndpoint,
  withInterceptors,
  withSSEHandle,
} from '@defjs/core'

// Step 1: Admit only validated inventory-low events from the authenticated inventory feed.
export const inventoryAlerts = defineEventStream({
  maxBufferSize: 1024,
  maxQueueSize: 8,
  path: '/v1/inventory/alerts',
  events: {
    'inventory-low': struct.json(struct.object({ available: struct.number(), sku: struct.string() })),
  },
})

// Step 2: Give one operation ownership of consuming the alert and closing the SSE handle.
export async function receiveLowStockAlert(client: Client) {
  const [error, stream] = await client.execute(inventoryAlerts())
  if (error) throw error

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'inventory-low':
          return { available: event.data.available, sku: event.data.sku }
      }
    }
    throw new Error('inventory feed ended before a low-stock alert arrived')
  } finally {
    stream.close('low-stock alert received')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Require the inventory credential and serve one finite low-stock event.
  const expectedAuthorization = `Basic ${btoa('inventory-reader:fixture-secret')}`
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.headers.get('authorization') !== expectedAuthorization) {
      return new Response(null, { status: 401 })
    }
    return new Response('event: inventory-low\nid: stock-1\ndata: {"available":2,"sku":"PUMP-42"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  // Step 4: Configure the typed SSE client with the SSE-specific Basic interceptor.
  const client = createClient(
    withEndpoint('https://inventory.invalid'),
    withSSEHandle(fixtureFetch),
    withInterceptors(basicAuthSSEInterceptor(() => ({ username: 'inventory-reader', password: 'fixture-secret' }))),
  )

  // Step 5: Open and consume the typed feed, close its handle, and emit the validated alert.
  console.log(JSON.stringify(await receiveLowStockAlert(client)))
}

if (import.meta.main) {
  await main()
}
