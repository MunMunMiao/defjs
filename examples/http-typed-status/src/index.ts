import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Separate customer records from the typed customer_not_found document at the HTTP boundary.
export const getCustomer = defineRequest({
  method: 'GET',
  path: '/customers/:id',
  input: struct.request({ path: struct.object({ id: struct.string() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.string(), name: struct.string() }) },
    {
      status: 404,
      body: struct.object({ code: struct.literal('customer_not_found'), message: struct.string() }),
    },
  ] as const,
})

// Step 2: Map only the declared 404 to a missing result while preserving every other failure.
export async function lookupCustomer(client: Client, id: string) {
  const [error, customer] = await client.execute(getCustomer({ path: { id } }))
  if (error) {
    if (error.kind === 'http' && error.status === 404) {
      return { kind: 'missing' as const, code: error.data.code }
    }
    throw error
  }
  return { kind: 'found' as const, customer }
}

export async function main(): Promise<void> {
  // Step 3: Serve one customer record and one typed not-found document locally.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const id = new URL(new Request(input, init).url).pathname.split('/').at(-1)
    const fixture =
      id === 'customer-1042'
        ? { body: { id: 'customer-1042', name: 'Amina Ortiz' }, status: 200 }
        : { body: { code: 'customer_not_found', message: 'Customer does not exist' }, status: 404 }
    return new Response(JSON.stringify(fixture.body), {
      headers: { 'content-type': 'application/json' },
      status: fixture.status,
    })
  }

  // Step 4: Look up both customer IDs through the same operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const found = await lookupCustomer(client, 'customer-1042')
  const missing = await lookupCustomer(client, 'customer-missing')

  // Step 5: Emit the distinct found and missing application results.
  console.log(JSON.stringify({ found, missing }))
}

if (import.meta.main) {
  await main()
}
