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

// Step 1: Type availability and the transient 503 branch used by the one allowed warehouse replay.
export const readWarehouseAvailability = defineRequest({
  method: 'GET',
  path: '/warehouses/eu-central/availability',
  output: [
    { status: 200, body: struct.object({ sku: struct.string(), availableUnits: struct.number() }) },
    { status: 503, body: struct.object({ message: struct.string() }) },
  ] as const,
})

// Step 2: Expose only successful availability after the interceptor chain settles.
export async function loadWarehouseAvailability(client: Client) {
  const [error, availability, response] = await client.execute(readWarehouseAvailability())
  if (error) throw error
  if (response.error) throw response.error
  return availability
}

// Step 3: Order authentication around logical reads, retry around replay, and telemetry around each physical attempt.
export function createInventoryPolicies(token: string, events: string[]) {
  const authentication = createHttpInterceptor(async (request, next) => {
    events.push('auth:before')
    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${token}`)
    try {
      return await next({ ...request, headers })
    } finally {
      events.push('auth:after')
    }
  })

  const retry = createHttpInterceptor(async (request, next) => {
    events.push('retry:before')
    try {
      let response = await next(request)
      if (response.status === 503) {
        events.push('retry:replay')
        response = await next(request)
      }
      return response
    } finally {
      events.push('retry:after')
    }
  })

  const attemptTelemetry = createHttpInterceptor(async (request, next) => {
    events.push('attempt:before')
    try {
      return await next(request)
    } finally {
      events.push('attempt:after')
    }
  })

  return [authentication, retry, attemptTelemetry]
}

export async function main(): Promise<void> {
  // Step 4: Record a local 503-then-200 sequence at the transport boundary.
  const events: string[] = []
  let attempts = 0
  const fixtureFetch: typeof fetch = async () => {
    attempts += 1
    events.push(`fetch:${attempts}`)
    if (attempts === 1) {
      return Response.json({ message: 'inventory replica warming' }, { status: 503 })
    }
    return Response.json({ sku: 'scanner-x2', availableUnits: 7 })
  }

  // Step 5: Execute the inventory read through the composed interceptor onion.
  const client = createClient(
    withEndpoint('https://inventory.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(...createInventoryPolicies('inventory-read-token', events)),
  )

  const availability = await loadWarehouseAvailability(client)

  // Step 6: Emit the validated availability and complete interceptor trace.
  console.log(JSON.stringify({ events, availability }))
}

if (import.meta.main) {
  await main()
}
