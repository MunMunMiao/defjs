import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Preserve the real inventory path and response Struct at the substituted transport boundary.
export const getInventoryItem = defineRequest({
  method: 'GET',
  path: '/inventory/:sku',
  input: struct.request({ path: struct.object({ sku: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.object({ available: struct.number(), name: struct.string(), sku: struct.string() }),
    },
  ],
})

// Step 2: Expose the same validated inventory operation through any injected Fetch implementation.
export async function loadInventoryItem(client: Client, sku: string) {
  const [error, item] = await client.execute(getInventoryItem({ path: { sku } }))
  if (error) throw error
  return item
}

export async function main(): Promise<void> {
  // Step 3: Derive the requested SKU and return deterministic local stock.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const sku = new URL(new Request(input, init).url).pathname.split('/').at(-1)
    return new Response(JSON.stringify({ available: 240, name: '4 x 6 thermal label roll', sku }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Install the fake Fetch transport on an otherwise real inventory client.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))

  // Step 5: Load and emit the typed inventory item through the substituted transport.
  console.log(JSON.stringify(await loadInventoryItem(client, 'label-roll-4x6')))
}

if (import.meta.main) {
  await main()
}
