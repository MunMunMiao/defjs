import { setTimeout as sleep } from 'node:timers/promises'
import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

// Step 1: Type inventory availability and the transient rebuilding status eligible for replay.
const MAX_RETRY_DELAY_MS = 1_000
export const readInventoryAvailability = defineRequest({
  method: 'GET',
  path: '/v1/inventory/:sku',
  input: struct.request({ path: struct.object({ sku: struct.string() }) }),
  output: [
    { status: 200, body: struct.object({ available: struct.number(), sku: struct.string() }) },
    { status: 429, body: struct.object({ code: struct.literal('inventory_rate_limited') }) },
    { status: 503, body: struct.object({ code: struct.literal('inventory_rebuilding') }) },
  ],
})

function retryDelay(value: string | null, nowMs: number): number | undefined {
  const normalized = value?.trim()
  if (!normalized) return undefined

  const requestedMs = /^\d+$/u.test(normalized) ? Number(normalized) * 1_000 : Date.parse(normalized) - nowMs
  if (!Number.isFinite(requestedMs)) return undefined
  return Math.min(Math.max(0, requestedMs), MAX_RETRY_DELAY_MS)
}

// Step 2: Allow one replay only for safe reads with a bounded, understood Retry-After value.
function retrySafeReads(
  wait: (delayMs: number, signal?: AbortSignal) => Promise<void> = async (delayMs, signal) => {
    await sleep(delayMs, undefined, { signal })
  },
) {
  return createHttpInterceptor(async (request, next) => {
    const response = await next(request)
    if (request.method !== 'GET' && request.method !== 'HEAD') return response
    if (response.status !== 429 && response.status !== 503) return response

    const delayMs = retryDelay(response.headers.get('retry-after'), Date.now())
    if (delayMs === undefined) return response
    await wait(delayMs, request.abort)
    return next(request)
  })
}

// Step 3: Return validated inventory while replay mechanics remain client policy.
export async function readAvailableInventory(client: Client, sku: string) {
  const [error, inventory, response] = await client.execute(readInventoryAvailability({ path: { sku } }))
  if (error) throw error
  if (response.error) throw response.error
  return inventory
}

export async function main(): Promise<void> {
  // Step 4: Return one retryable outage followed by available inventory.
  let attempts = 0
  const fixtureFetch: typeof fetch = async () => {
    attempts += 1
    if (attempts === 1) {
      return Response.json({ code: 'inventory_rebuilding' }, { headers: { 'retry-after': '0' }, status: 503 })
    }
    return Response.json({ available: 7, sku: 'SKU-482' })
  }

  // Step 5: Read the SKU through the bounded safe-read retry policy.
  const client = createClient(
    withEndpoint('https://inventory.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(retrySafeReads(async () => {})),
  )
  const inventory = await readAvailableInventory(client, 'SKU-482')

  // Step 6: Emit the validated inventory and exact attempt count.
  console.log(
    JSON.stringify({
      sku: inventory.sku,
      available: inventory.available,
      attempts,
    }),
  )
}

if (import.meta.main) {
  await main()
}
