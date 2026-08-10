import { createClient, defineEventStream, struct, withEndpoint, withSSEHandle } from '@defjs/core'

// Step 1: Admit only numeric cold-room readings into the bounded stream queue.
const QUEUE_CAPACITY = 2
export const temperatureEvents = defineEventStream({
  maxBufferSize: 256,
  maxQueueSize: QUEUE_CAPACITY,
  path: '/v1/cold-rooms/CR-7/temperature',
  events: { 'temperature-celsius': struct.number() },
})

// Step 2: Keep connection-wide transport wiring separate from endpoint-owned resource limits.
function createTemperatureClient(handle: typeof fetch) {
  return createClient(withEndpoint('https://warehouse.invalid'), withSSEHandle(handle))
}

// Step 3: Observe overflow as a terminal error instead of silently dropping a temperature.
export async function observeTemperatureOverflow(client: ReturnType<typeof createTemperatureClient>): Promise<string> {
  const [error, stream] = await client.execute(temperatureEvents())
  if (error) throw error

  try {
    const close = await stream.closed
    if (close.code !== 'error') {
      throw new Error(`Expected queue overflow, received ${close.code}`)
    }
    return close.code
  } finally {
    stream.close('temperature overflow observed')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 4: Emit three finite temperature events into a two-entry queue.
  const fixtureFetch: typeof fetch = async () =>
    new Response(
      'event: temperature-celsius\ndata: 18\n\n' + 'event: temperature-celsius\ndata: 19\n\n' + 'event: temperature-celsius\ndata: 20\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )

  // Step 5: Observe the endpoint-owned queue overflowing at the third event.
  const terminal = await observeTemperatureOverflow(createTemperatureClient(fixtureFetch))

  // Step 6: Emit the deterministic terminal state; no reading was silently discarded.
  console.log(JSON.stringify({ terminal }))
}

if (import.meta.main) {
  await main()
}
