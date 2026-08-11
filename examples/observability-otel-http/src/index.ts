import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { createTelemetryFixture } from './telemetry'

// Step 1: Type the fulfillment job allowed into application code from the warehouse call.
export const readFulfillmentJob = defineRequest({
  method: 'GET',
  operation: 'fulfillment.job.read',
  path: '/v1/fulfillment/jobs/current',
  output: [
    {
      status: 200,
      body: struct.object({ jobId: struct.literal('job-204'), status: struct.literal('ready-for-pick') }),
    },
  ],
})

// Step 2: Keep the job read independent of telemetry while returning only validated data.
export async function loadFulfillmentJob(client: Client) {
  const [error, job] = await client.execute(readFulfillmentJob())
  if (error) throw error
  return job
}

export async function main(): Promise<void> {
  // Step 3: Capture W3C propagation and create isolated in-memory telemetry.
  let traceparentInjected = false
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    traceparentInjected = request.headers.has('traceparent')
    return Response.json({ jobId: 'job-204', status: 'ready-for-pick' })
  }
  const telemetry = createTelemetryFixture()

  // Step 4: Execute the fulfillment read through the HTTP-instrumented client.
  try {
    const client = createClient(
      withEndpoint('https://warehouse.invalid'),
      withHTTPHandle(fixtureFetch),
      withOpenTelemetryServer({
        meter: telemetry.meter,
        propagator: telemetry.propagator,
        sse: { enabled: false },
        tracer: telemetry.tracer,
        webSocket: { enabled: false },
      }),
    )

    const job = await loadFulfillmentJob(client)
    const span = telemetry.exporter.getFinishedSpans()[0]
    if (!span) throw new Error('HTTP span did not finish')
    const operation = span.attributes['defjs.operation']
    if (operation !== 'fulfillment.job.read') throw new Error('HTTP span operation is missing')

    // Step 5: Emit only the validated job and stable operation identity, never the resolved URL.
    console.log(JSON.stringify({ job, span: { name: span.name, operation }, traceparentInjected }))
  } finally {
    // Step 6: Shut down both local providers after span completion.
    await telemetry.shutdown()
  }
}

if (import.meta.main) {
  await main()
}
