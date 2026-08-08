import { createClient, defineEventStream, struct, withEndpoint, withSSEHandle } from '@defjs/core'

// Step 1: Assign a distinct Struct to each storefront catalog event before projection.
export type CatalogChange = { kind: 'price-updated'; priceCents: number; sku: string } | { kind: 'product-retired'; sku: string }
export const catalogChanges = defineEventStream({
  path: '/v1/catalog/changes',
  events: {
    'price-updated': struct.json(struct.object({ priceCents: struct.number(), sku: struct.string() })),
    'product-retired': struct.json(struct.object({ sku: struct.string() })),
  },
})

function createCatalogClient(handle: typeof fetch) {
  return createClient(withEndpoint('https://catalog.invalid'), withSSEHandle(handle))
}

// Step 2: Exhaustively switch over validated event names so each case receives its matching Struct output.
export async function projectCatalogChanges(client: ReturnType<typeof createCatalogClient>): Promise<CatalogChange[]> {
  const [error, stream] = await client.execute(catalogChanges())
  if (error) throw error

  const changes: CatalogChange[] = []
  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'price-updated':
          changes.push({ kind: event.event, priceCents: event.data.priceCents, sku: event.data.sku })
          break
        case 'product-retired':
          changes.push({ kind: event.event, sku: event.data.sku })
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
    return changes
  } finally {
    stream.close('catalog projection complete')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Serve one price update and one retirement as named SSE events.
  const fixtureFetch: typeof fetch = async () =>
    new Response(
      'event: price-updated\ndata: {"priceCents":1299,"sku":"TEA-42"}\n\n' + 'event: product-retired\ndata: {"sku":"MUG-7"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )

  // Step 4: Project the finite feed through the typed catalog client.
  const changes = await projectCatalogChanges(createCatalogClient(fixtureFetch))

  // Step 5: Emit the two validated storefront changes.
  console.log(JSON.stringify({ changes }))
}

if (import.meta.main) {
  await main()
}
