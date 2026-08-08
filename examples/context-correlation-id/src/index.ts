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

// Step 1: Reserve request context for one request-scoped gateway correlation ID and typed order read.
export const correlationIdContext = makeHttpContextToken(() => '')

export const readOrderSummary = defineRequest({
  method: 'GET',
  path: '/v1/orders/order-1042',
  output: [
    {
      status: 200,
      body: struct.object({ id: struct.literal('order-1042'), status: struct.literal('packed') }),
    },
  ] as const,
})

// Step 2: Copy only the current execution's correlation ID into the downstream header at dispatch.
export const correlationInterceptor = createHttpInterceptor((request, next) => {
  const correlationId = request.context?.get(correlationIdContext)
  if (!correlationId) throw new Error('correlation ID is required')

  const headers = new Headers(request.headers)
  headers.set('x-correlation-id', correlationId)
  return next({ ...request, headers })
})

// Step 3: Create fresh context for each order read so shared-client calls cannot overwrite one another.
export async function readCorrelatedOrder(client: Client, correlationId: string) {
  const context = makeHttpContext().set(correlationIdContext, correlationId)
  const [error, order] = await client.execute(readOrderSummary(), { context })
  if (error) throw error
  return order
}

export async function main(): Promise<void> {
  // Step 4: Capture the correlation header in an offline order fixture.
  let receivedCorrelationId = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    receivedCorrelationId = request.headers.get('x-correlation-id') ?? ''
    if (!receivedCorrelationId) throw new Error('fixture did not receive a correlation ID')
    return Response.json({ id: 'order-1042', status: 'packed' })
  }

  // Step 5: Read the order with a fresh request-scoped correlation context.
  const client = createClient(
    withEndpoint('https://orders.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(correlationInterceptor),
  )

  const order = await readCorrelatedOrder(client, 'checkout-req-1042')

  // Step 6: Emit the propagated ID beside the validated order.
  console.log(JSON.stringify({ correlationId: receivedCorrelationId, order }))
}

if (import.meta.main) {
  await main()
}
