import { createClient, defineEventStream, struct, type Client, withEndpoint, withSSEHandle, withSSEReconnect } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { createTelemetryFixture } from './telemetry'

// Step 1: Admit typed shipment progress and keepalive events from the logical SSE stream.
export const shipmentUpdates = defineEventStream({
  path: '/v1/shipments/ship-204/updates',
  events: {
    heartbeat: struct.string(),
    progress: struct.json(struct.object({ shipmentId: struct.literal('ship-204'), status: struct.literal('packed') })),
  },
})

// Step 2: Narrow the validated event union, then own stream closure and settlement before telemetry shutdown.
export async function readShipmentCheckpoint(client: Client) {
  const [error, stream] = await client.execute(shipmentUpdates())
  if (error) throw error
  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'heartbeat':
          break
        case 'progress':
          return event.data
        default: {
          const exhaustive: never = event
          throw new Error(`Unexpected shipment event: ${JSON.stringify(exhaustive)}`)
        }
      }
    }
    throw new Error('shipment stream ended before a checkpoint')
  } finally {
    stream.close('shipment checkpoint received')
    await stream.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Serve one open progress stream and capture its W3C trace header.
  const encoder = new TextEncoder()
  let traceparentInjected = false
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    traceparentInjected = request.headers.has('traceparent')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: progress\nid: update-7\ndata: {"shipmentId":"ship-204","status":"packed"}\n\n'))
      },
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }

  // Step 4: Consume the checkpoint through a client with only SSE telemetry enabled.
  const telemetry = createTelemetryFixture()

  try {
    const client = createClient(
      withEndpoint('https://logistics.invalid'),
      withSSEHandle(fixtureFetch),
      withSSEReconnect({ attempts: 0 }),
      withOpenTelemetryServer({
        http: { enabled: false },
        meter: telemetry.meter,
        propagator: telemetry.propagator,
        tracer: telemetry.tracer,
        webSocket: { enabled: false },
      }),
    )

    const event = await readShipmentCheckpoint(client)
    const span = telemetry.exporter.getFinishedSpans()[0]
    if (!span) throw new Error('SSE span did not finish')

    // Step 5: Emit the validated event and finished logical-stream span.
    console.log(
      JSON.stringify({
        event,
        span: { events: span.events.map(({ name }) => name), name: span.name },
        traceparentInjected,
      }),
    )
  } finally {
    // Step 6: Shut down both local providers after stream closure.
    await telemetry.shutdown()
  }
}

if (import.meta.main) {
  await main()
}
