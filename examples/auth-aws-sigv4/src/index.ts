import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'
import { AwsClient } from 'aws4fetch'
import { createSigV4Fixture, type AwsCredential } from './fixture'

const region = 'us-east-1'
const service = 'execute-api'

// Step 1: Fix the report path and JSON shape before any SigV4 signature is computed.
export const uploadDailyReport = defineRequest({
  method: 'PUT',
  path: '/v1/reports/:reportDate',
  input: struct.request({
    path: struct.object({ reportDate: struct.string() }),
    body: struct.json(struct.object({ completedOrders: struct.number(), warehouse: struct.string() })),
  }),
  output: [{ status: 204, body: struct.null() }],
})

// Step 2: Expose report publication only after Defjs accepts the bodyless success response.
export async function publishDailyReport(client: Client, reportDate: string, warehouse: string, completedOrders: number) {
  const [error, , response] = await client.execute(uploadDailyReport({ body: { completedOrders, warehouse }, path: { reportDate } }))
  if (error) throw error
  if (response.error) throw response.error
  return response.status
}

export async function main(): Promise<void> {
  // Step 3: Create fixed temporary credentials and a local verifier for the signed request.
  const credential: AwsCredential = {
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'fixture-secret-key',
    sessionToken: 'fixture-session-token',
  }
  const fixture = createSigV4Fixture(credential, region, service)
  const signingFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const aws = new AwsClient({ ...credential, region, retries: 0, service })
    const signed = await aws.sign(request, { aws: { datetime: '20250228T120000Z' } })
    return fixture.fetch(signed)
  }

  // Step 4: Sign and publish the daily fulfillment report at the Fetch boundary.
  const client = createClient(withEndpoint('https://reports.invalid'), withHTTPHandle(signingFetch))
  const status = await publishDailyReport(client, '2025-02-28', 'sea-1', 128)
  const accepted = fixture.accepted
  if (!accepted) throw new Error('local SigV4 verifier did not accept the report')

  // Step 5: Emit accepted report data and credential scope without secrets or signatures.
  console.log(JSON.stringify({ ...accepted, status }))
}

if (import.meta.main) {
  await main()
}
