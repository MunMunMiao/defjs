import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Declare required, optional, nullable, and nullish response fields.
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
  ],
})

// Step 2: Return Struct-decoded values without truthy fallback replacements.
export async function loadStoreDaySummary(client: Client, date: string) {
  const [error, summary] = await client.execute(readStoreDaySummary({ path: { date } }))
  if (error) throw error
  return summary
}

export async function main(): Promise<void> {
  // Step 3: Return every required value and omit only optional and nullish fields.
  const fixtureFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        orders: 0,
        acceptingOrders: false,
        adjustmentIds: [],
        operatorMessage: '',
        managerNote: null,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )

  // Step 4: Create the fixture-backed typed daily-summary client.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))

  // Step 5: Decode and emit explicit values while preserving omitted optional and nullish fields.
  console.log(JSON.stringify(await loadStoreDaySummary(client, '2026-06-01')))
}

if (import.meta.main) {
  await main()
}
