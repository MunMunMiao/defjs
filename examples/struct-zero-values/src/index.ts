import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Assign endpoint-specific zero, optional, nullable, and nullish meaning to sparse fields.
export const readStoreDaySummary = defineRequest({
  method: 'GET',
  path: '/stores/store-1042/daily-summaries/:date',
  input: struct.request({ path: struct.object({ date: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.object({
        orders: struct.number(),
        acceptingOrders: struct.boolean(),
        adjustmentIds: struct.array(struct.string()),
        operatorMessage: struct.string(),
        promotionCode: struct.string().optional(),
        managerNote: struct.string().null(),
        suspensionReason: struct.string().nullish(),
      }),
    },
  ] as const,
})

// Step 2: Return Defjs-decoded summary values instead of truthy fallback replacements.
export async function loadStoreDaySummary(client: Client, date: string) {
  const [error, summary] = await client.execute(readStoreDaySummary({ path: { date } }))
  if (error) throw error
  return summary
}

export async function main(): Promise<void> {
  // Step 3: Return one intentionally sparse store-day document.
  const fixtureFetch: typeof fetch = async () =>
    new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  // Step 4: Create the fixture-backed typed daily-summary client.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))

  // Step 5: Decode and emit the sparse summary with its resolved defaults, nulls, and omitted optional field.
  console.log(JSON.stringify(await loadStoreDaySummary(client, '2026-06-01')))
}

if (import.meta.main) {
  await main()
}
