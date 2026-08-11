import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'
import { EnvHttpProxyAgent, MockAgent, Request as UndiciRequest, fetch as undiciFetch } from 'undici'

// Step 1: Type the pickup command independently from how Node routes its native request.
export const scheduleCarrierPickup = defineRequest({
  method: 'POST',
  path: '/pickups',
  input: struct.request({
    body: struct.json(struct.object({ orderId: struct.string(), warehouseId: struct.string() })),
  }),
  output: [
    {
      status: 202,
      body: struct.object({ pickupId: struct.string(), state: struct.literal('scheduled') }),
    },
  ],
})

// Step 2: Separate pickup behavior from the caller-owned proxy client that carries complete requests.
export async function requestCarrierPickup(client: Client, orderId: string, warehouseId: string) {
  const [error, pickup] = await client.execute(scheduleCarrierPickup({ body: { orderId, warehouseId } }))
  if (error) throw error
  return pickup
}
export function createCarrierProxyClient(endpoint: string, dispatcher: EnvHttpProxyAgent) {
  const proxyFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const proxyRequest = new UndiciRequest(request.url, {
      method: request.method,
      headers: [...request.headers],
      signal: request.signal,
      ...(request.body === null ? {} : { body: request.body, duplex: 'half' as const }),
    })
    return (await undiciFetch(proxyRequest, { dispatcher })) as unknown as Response
  }
  return createClient(withEndpoint(endpoint), withHTTPHandle(proxyFetch))
}

export async function main(): Promise<void> {
  // Step 3: Register the carrier route on a network-disabled Undici fixture.
  const endpoint = 'https://carrier-api.fixture.invalid/operations/v2'
  const fixture = new MockAgent()
  fixture.disableNetConnect()
  fixture
    .get(new URL(endpoint).origin)
    .intercept({ method: 'POST', path: '/operations/v2/pickups' })
    .reply(202, JSON.stringify({ pickupId: 'pickup-7001', state: 'scheduled' }), {
      headers: { 'content-type': 'application/json' },
    })

  // Step 4: Create the environment-proxy client and schedule one pickup.
  let proxySelected = false
  const agent = new EnvHttpProxyAgent({
    httpsProxy: 'http://egress-proxy.fixture.invalid:8080',
    noProxy: '',
    factory() {
      proxySelected = true
      return fixture
    },
  })
  const client = createCarrierProxyClient(endpoint, agent)
  let pickup: Awaited<ReturnType<typeof requestCarrierPickup>> | undefined

  try {
    pickup = await requestCarrierPickup(client, 'order-1042', 'warehouse-iad-2')
  } finally {
    // Step 5: Close the proxy agent and any unselected fixture dispatcher.
    try {
      await agent.close()
    } finally {
      if (!proxySelected) await fixture.close()
    }
  }

  if (!pickup) throw new Error('carrier pickup did not complete')

  // Step 6: Emit the selected route and validated pickup after shutdown.
  console.log(JSON.stringify({ endpoint, route: proxySelected ? 'proxy' : 'direct', pickup }))
}

if (import.meta.main) {
  await main()
}
