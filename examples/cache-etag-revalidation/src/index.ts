import { createClient, defineRequest, struct, type Client, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Model product data and bodyless 304 revalidation as distinct catalog outcomes.
const catalogProductStruct = struct.object({ name: struct.string(), priceCents: struct.number(), sku: struct.string() })
export const readCatalogProduct = defineRequest({
  method: 'GET',
  path: '/v1/catalog/products/:sku',
  input: struct.request({
    path: struct.object({ sku: struct.string() }),
    headers: struct.object({ etag: struct.string().optional().alias('If-None-Match') }),
  }),
  output: [
    {
      status: 200,
      body: catalogProductStruct,
    },
    { status: 304, body: struct.null() },
  ] as const,
})

type CatalogProduct = Infer<typeof catalogProductStruct>
type CacheEntry = { etag: string; product: CatalogProduct }

// Step 2: Keep each decoded product coupled to its opaque ETag inside the client-bound cache owner.
export function createRevalidatingProductReader(client: Client, capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('cache capacity must be a positive integer')
  const cache = new Map<string, CacheEntry>()

  return async function readProduct(sku: string): Promise<CatalogProduct> {
    const cached = cache.get(sku)
    const [error, product, response] = await client.execute(readCatalogProduct({ path: { sku }, headers: { etag: cached?.etag } }))
    if (error) {
      if (error.kind === 'http' && error.status === 304 && cached) return cached.product
      throw error
    }
    if (response.error) throw response.error

    const etag = response.headers.get('etag')
    if (!etag) throw new Error('catalog response is missing ETag')
    if (!cache.has(sku) && cache.size >= capacity) {
      const oldestSku = cache.keys().next().value
      if (oldestSku !== undefined) cache.delete(oldestSku)
    }
    cache.set(sku, { etag, product })
    return product
  }
}

export async function main(): Promise<void> {
  // Step 3: Serve one catalog product with a stable ETag and a bodyless 304 path.
  const product = { name: 'Thermal Flask', priceCents: 3_200, sku: 'SKU-482' }
  const etag = '"catalog-7"'
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { headers: { etag }, status: 304 })
    }
    return Response.json(product, { headers: { etag } })
  }

  // Step 4: Read once to populate the cache, then revalidate the same SKU.
  const client = createClient(withEndpoint('https://catalog.invalid'), withHTTPHandle(fixtureFetch))
  const readProduct = createRevalidatingProductReader(client, 2)
  await readProduct('SKU-482')
  const revalidated = await readProduct('SKU-482')

  // Step 5: Emit the cached product selected by the successful revalidation.
  console.log(JSON.stringify(revalidated))
}

if (import.meta.main) {
  await main()
}
