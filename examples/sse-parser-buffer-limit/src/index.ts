import { createClient, defineEventStream, struct, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'

// Step 1: Define the risk-alert payload independently from the lower-level unfinished-line limit.
const PARSER_BUFFER_LIMIT = 32
export const riskAlertEvents = defineEventStream({
  maxBufferSize: PARSER_BUFFER_LIMIT,
  maxQueueSize: 8,
  path: '/v1/payments/risk-alerts',
  events: {
    'risk-alert': struct.json(struct.object({ paymentId: struct.string(), score: struct.number() })),
  },
})

// Step 2: Bound retained parser bytes while keeping retry enabled for nonfatal failures.
function createRiskAlertClient(handle: typeof fetch) {
  return createClient(withEndpoint('https://risk.invalid'), withSSEHandle(handle), withSSEReconnect({ attempts: 2, delayMs: 1 }))
}

// Step 3: Close the stream on parser failure without exposing rejected payload bytes.
export async function readRiskAlerts(client: ReturnType<typeof createRiskAlertClient>): Promise<string[]> {
  const [error, stream] = await client.execute(riskAlertEvents())
  if (error) throw error

  const paymentIds: string[] = []
  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'risk-alert':
          paymentIds.push(event.data.paymentId)
          break
      }
    }
    return paymentIds
  } finally {
    stream.close('risk alert reader complete')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 4: Count requests while serving an unterminated line beyond the parser byte ceiling.
  let requests = 0
  const fixtureFetch: typeof fetch = async () => {
    requests += 1
    return new Response(`data: ${'x'.repeat(PARSER_BUFFER_LIMIT)}`, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  // Step 5: Read the feed through the client with the explicit parser limit.
  try {
    const paymentIds = await readRiskAlerts(createRiskAlertClient(fixtureFetch))
    console.log(JSON.stringify({ paymentIds }))
  } catch (error) {
    if (!(error instanceof Error)) throw error
    if (requests !== 1) throw new Error(`Expected one fatal parser request, received ${requests}`)

    // Step 6: Emit the parser error, configured limit, and request count without payload bytes.
    console.log(JSON.stringify({ error: error.message, parserLimitBytes: PARSER_BUFFER_LIMIT, requests }))
  }
}

if (import.meta.main) {
  await main()
}
