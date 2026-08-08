import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'
import { circuitBreaker, ConsecutiveBreaker, handleWhen, isBrokenCircuitError } from 'cockatiel'

// Step 1: Type successful quotes and the provider-outage response counted by the breaker.
export const readShippingQuote = defineRequest({
  method: 'GET',
  path: '/v1/shipping/quotes/:orderId',
  input: struct.request({ path: struct.object({ orderId: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.object({ amountCents: struct.number(), carrier: struct.string(), orderId: struct.string() }),
    },
    { status: 503, body: struct.object({ code: struct.literal('quote_provider_unavailable') }) },
  ] as const,
})

function isShippingOutage(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('kind' in error)) return false
  return error.kind === 'transport' || (error.kind === 'http' && 'status' in error && error.status === 503)
}

// Step 2: Keep one breaker beside the client so failure history survives individual quote calls.
export function createShippingQuoteReader(client: Client) {
  const breaker = circuitBreaker(handleWhen(isShippingOutage), {
    breaker: new ConsecutiveBreaker(3),
    halfOpenAfter: 30_000,
  })

  return async function readQuote(orderId: string) {
    return breaker.execute(async ({ signal }) => {
      const [error, quote, response] = await client.execute(readShippingQuote({ path: { orderId } }), { signal })
      if (error) throw error
      if (response.error) throw response.error
      return quote
    })
  }
}

export async function main(): Promise<void> {
  // Step 3: Count local carrier calls while returning the declared 503 outage.
  let upstreamCalls = 0
  const fixtureFetch: typeof fetch = async () => {
    upstreamCalls += 1
    return Response.json({ code: 'quote_provider_unavailable' }, { status: 503 })
  }

  // Step 4: Reuse one breaker-backed reader across four quote attempts.
  const client = createClient(withEndpoint('https://shipping.invalid'), withHTTPHandle(fixtureFetch))
  const readQuote = createShippingQuoteReader(client)
  let circuit = 'closed'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await readQuote('order-734')
    } catch (error) {
      if (isBrokenCircuitError(error)) {
        circuit = 'open'
        break
      }
      if (!isShippingOutage(error)) throw error
    }
  }

  // Step 5: Emit the open-circuit state and calls that reached Fetch.
  console.log(JSON.stringify({ circuit, upstreamCalls }))
}

if (import.meta.main) {
  await main()
}
