import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Keep accepted and account-closed bodies distinct from provider diagnostic headers.
export const submitInvoiceExportRequest = defineRequest({
  method: 'POST',
  path: '/v1/invoice-exports',
  input: struct.request({
    body: struct.json(struct.object({ customerId: struct.string(), period: struct.string() })),
  }),
  output: [
    { status: 202, body: struct.object({ exportId: struct.string() }) },
    { status: 409, body: struct.object({ code: struct.literal('account_closed') }) },
  ],
})

function providerRequestId(headers: Headers): string {
  const requestId = headers.get('x-request-id')
  if (!requestId) throw new Error('provider response is missing x-request-id')
  return requestId
}

// Step 2: Retain the provider request ID from either response side before returning the export outcome.
export async function submitInvoiceExport(client: Client, customerId: string) {
  const [error, accepted, response] = await client.execute(submitInvoiceExportRequest({ body: { customerId, period: '2025-02' } }))
  if (error) {
    if (error.kind !== 'http') throw error
    return {
      ok: false as const,
      providerRequestId: providerRequestId(error.response.headers),
      status: error.status,
    }
  }
  return {
    exportId: accepted.exportId,
    ok: true as const,
    providerRequestId: providerRequestId(response.headers),
  }
}

export async function main(): Promise<void> {
  // Step 3: Return accepted and rejected exports with distinct provider request IDs.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const { customerId } = (await request.json()) as { customerId: string }
    if (customerId === 'customer-acme') {
      return Response.json({ exportId: 'export-1042' }, { headers: { 'x-request-id': 'req-accepted-1042' }, status: 202 })
    }
    return Response.json({ code: 'account_closed' }, { headers: { 'x-request-id': 'req-rejected-204' }, status: 409 })
  }

  // Step 4: Submit both customers through the same typed export operation.
  const client = createClient(withEndpoint('https://exports.invalid'), withHTTPHandle(fixtureFetch))
  const accepted = await submitInvoiceExport(client, 'customer-acme')
  const rejected = await submitInvoiceExport(client, 'customer-closed')

  // Step 5: Emit each business outcome with its retained request ID.
  console.log(JSON.stringify({ accepted, rejected }))
}

if (import.meta.main) {
  await main()
}
