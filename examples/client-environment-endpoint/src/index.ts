import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Keep the billing health route relative so deployment configuration retains its base path.
export const getBillingHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: [
    {
      status: 200,
      body: struct.object({ service: struct.literal('billing'), state: struct.literal('ready') }),
    },
  ] as const,
})

// Step 2: Reject untrusted endpoint components before giving the complete HTTPS base URL to Defjs.
export function createBillingClient(rawEndpoint: unknown, handle: typeof fetch = globalThis.fetch) {
  if (typeof rawEndpoint !== 'string') throw new TypeError('billing endpoint must be a URL string')
  const endpoint = new URL(rawEndpoint)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TypeError('billing endpoint must be a credential-free HTTPS URL without query or fragment')
  }
  return createClient(withEndpoint(endpoint.href), withHTTPHandle(handle))
}

export async function main(): Promise<void> {
  // Step 3: Capture the fully resolved health URL in a local billing fixture.
  let requestUrl = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    requestUrl = new Request(input, init).url
    return new Response(JSON.stringify({ service: 'billing', state: 'ready' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Build the client from the validated base path and execute the health request.
  const client = createBillingClient('https://billing.fixture.invalid/tenants/acme/v2', fixtureFetch)
  const [error, health] = await client.execute(getBillingHealth())
  if (error) throw error

  // Step 5: Emit the preserved request URL with the typed health response.
  console.log(JSON.stringify({ requestUrl, health }))
}

if (import.meta.main) {
  await main()
}
