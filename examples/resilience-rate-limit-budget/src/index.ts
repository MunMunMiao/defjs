import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Separate export capacity from the typed quota-exhausted provider response.
const MAX_SCHEDULER_DELAY_MS = 60_000
export const readExportCapacity = defineRequest({
  method: 'GET',
  path: '/v1/export-capacity/:region',
  input: struct.request({ path: struct.object({ region: struct.string() }) }),
  output: [
    { status: 200, body: struct.object({ remainingJobs: struct.number() }) },
    { status: 429, body: struct.object({ code: struct.literal('export_quota_exhausted') }) },
  ],
})

function retryAfterDecision(value: string | null, nowMs: number) {
  const normalized = value?.trim()
  if (!normalized) return { exceededBudget: false, retryAfterMs: null }

  const requestedMs = /^\d+$/u.test(normalized) ? Number(normalized) * 1_000 : Date.parse(normalized) - nowMs
  if (!Number.isFinite(requestedMs)) return { exceededBudget: false, retryAfterMs: null }
  const positiveMs = Math.max(0, requestedMs)
  return {
    exceededBudget: positiveMs > MAX_SCHEDULER_DELAY_MS,
    retryAfterMs: Math.min(positiveMs, MAX_SCHEDULER_DELAY_MS),
  }
}

// Step 2: Convert only typed quota responses into capped scheduling metadata without sleeping or retrying.
export async function readCapacityDecision(client: Client, region: string, nowMs = Date.now()) {
  const [error, capacity, response] = await client.execute(readExportCapacity({ path: { region } }))
  if (error) {
    if (error.kind !== 'http' || error.status !== 429) throw error
    return {
      kind: 'quota-exhausted' as const,
      ...retryAfterDecision(error.response.headers.get('retry-after'), nowMs),
    }
  }
  if (response.error) throw response.error
  return { kind: 'capacity' as const, remainingJobs: capacity.remainingJobs }
}

export async function main(): Promise<void> {
  // Step 3: Return one quota response with a delay beyond the local budget.
  const fixtureFetch: typeof fetch = async () =>
    Response.json({ code: 'export_quota_exhausted' }, { headers: { 'retry-after': '120' }, status: 429 })

  // Step 4: Read the capacity decision once through the typed client.
  const client = createClient(withEndpoint('https://exports.invalid'), withHTTPHandle(fixtureFetch))
  const decision = await readCapacityDecision(client, 'us-east', Date.UTC(2025, 0, 1))

  // Step 5: Emit the capped delay and exceeded-budget classification.
  console.log(JSON.stringify(decision))
}

if (import.meta.main) {
  await main()
}
