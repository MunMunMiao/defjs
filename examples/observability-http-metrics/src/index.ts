import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  makeHttpContext,
  makeHttpContextToken,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

// Step 1: Carry a bounded operation label beside the typed reservation instead of deriving metrics from URLs or SKUs.
type InventoryOperation = 'inventory.reserve' | 'unknown'
export const operationNameContext = makeHttpContextToken<InventoryOperation>(() => 'unknown')

export const reserveInventoryRequest = defineRequest({
  method: 'POST',
  path: '/v1/inventory/reservations',
  input: struct.request({ body: struct.json(struct.object({ sku: struct.string() })) }),
  output: [{ status: 200, body: struct.object({ reservationId: struct.string() }) }],
})

export interface HttpMetric {
  durationMs: number
  operation: InventoryOperation
  status: string
}

export interface HttpMetrics {
  active(delta: 1 | -1, operation: InventoryOperation): void
  complete(metric: HttpMetric): void
}

// Step 2: Balance active work in finally and record one low-cardinality completion for every outcome.
export function instrumentHttp(metrics: HttpMetrics, now: () => number = () => performance.now()) {
  return createHttpInterceptor(async (request, next) => {
    const operation = request.context?.get(operationNameContext) ?? 'unknown'
    const started = now()
    let status = 'transport'

    metrics.active(1, operation)
    try {
      const response = await next(request)
      status = response.error || response.status === 0 ? 'transport' : String(response.status)
      return response
    } finally {
      metrics.active(-1, operation)
      metrics.complete({ durationMs: now() - started, operation, status })
    }
  })
}

// Step 3: Attach the reviewed inventory.reserve identity at the business-operation boundary.
export async function reserveInventory(client: Client, sku: string) {
  const context = makeHttpContext().set(operationNameContext, 'inventory.reserve')
  const [error, reservation] = await client.execute(reserveInventoryRequest({ body: { sku } }), { context })
  if (error) throw error
  return reservation
}

export async function main(): Promise<void> {
  // Step 4: Create the deterministic metric sink.
  let activeRequests = 0
  let metric: HttpMetric | undefined
  let time = 88
  const metrics: HttpMetrics = {
    active(delta) {
      activeRequests += delta
    },
    complete(value) {
      metric = value
    },
  }

  // Step 5: Define the local inventory response and execute the instrumented reservation.
  const fixtureFetch: typeof fetch = async () => Response.json({ reservationId: 'reservation-1042' })
  const client = createClient(
    withEndpoint('https://inventory.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(instrumentHttp(metrics, () => (time += 12))),
  )

  const reservation = await reserveInventory(client, 'SKU-AVAILABLE')
  if (!metric) throw new Error('request metric was not recorded')

  // Step 6: Emit the balanced gauge, completion metric, and reservation.
  console.log(JSON.stringify({ activeRequests, metric, reservation }))
}

if (import.meta.main) {
  await main()
}
