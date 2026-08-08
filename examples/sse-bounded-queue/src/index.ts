import { createClient, defineEventStream, struct, withEndpoint, withSSEHandle, withSSEQueue } from '@defjs/core'

// Step 1: Admit only numeric cold-room readings into the bounded stream queue.
const QUEUE_CAPACITY = 2
export const temperatureEvents = defineEventStream({
  path: '/v1/cold-rooms/CR-7/temperature',
  events: { 'temperature-celsius': struct.number() },
})

// Step 2: Own a two-entry drop-oldest policy for current-state catch-up.
function createTemperatureClient(handle: typeof fetch) {
  return createClient(
    withEndpoint('https://warehouse.invalid'),
    withSSEHandle(handle),
    withSSEQueue({ maxSize: QUEUE_CAPACITY, overflow: 'drop-oldest' }),
  )
}

// Step 3: Drain the settled queue in source order and always close its stream handle.
export async function readLatestTemperatures(client: ReturnType<typeof createTemperatureClient>): Promise<number[]> {
  const [error, stream] = await client.execute(temperatureEvents())
  if (error) throw error

  try {
    await stream.closed
    const readings: number[] = []
    for await (const event of stream) {
      switch (event.event) {
        case 'temperature-celsius':
          readings.push(event.data)
          break
      }
    }
    return readings
  } finally {
    stream.close('temperature catch-up complete')
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

  // Step 5: Drain the stream through the bounded temperature client.
  const readings = await readLatestTemperatures(createTemperatureClient(fixtureFetch))

  // Step 6: Emit the two freshest validated readings in source order.
  console.log(JSON.stringify({ readings }))
}

if (import.meta.main) {
  await main()
}
