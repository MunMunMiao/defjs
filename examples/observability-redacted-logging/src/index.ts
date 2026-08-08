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

// Step 1: Carry one fixed operation name separately from sensitive email and authorization inputs.
type CustomerOperation = 'customers.lookup' | 'unknown'
export const operationNameContext = makeHttpContextToken<CustomerOperation>(() => 'unknown')

export const lookupCustomerRequest = defineRequest({
  method: 'GET',
  path: '/v1/customers/lookup',
  input: struct.request({
    query: struct.object({ email: struct.string() }),
    headers: struct.object({ authorization: struct.string() }),
  }),
  output: [{ status: 200, body: struct.object({ customerId: struct.string() }) }] as const,
})

export interface SafeRequestLog {
  durationMs: number
  method: string
  operation: CustomerOperation
  status: number | 'transport-error'
}

// Step 2: Construct logs only from the allowlisted operation, method, status, and duration.
export function redactedRequestLogger(write: (entry: SafeRequestLog) => void, now = () => performance.now()) {
  return createHttpInterceptor(async (request, next) => {
    const started = now()
    const operation = request.context?.get(operationNameContext) ?? 'unknown'
    let status: SafeRequestLog['status'] = 'transport-error'
    try {
      const response = await next(request)
      status = response.error || response.status === 0 ? 'transport-error' : response.status
      return response
    } finally {
      write({ durationMs: now() - started, method: request.method, operation, status })
    }
  })
}

// Step 3: Send lookup secrets to transport while publishing only validated customer data.
export async function lookupCustomer(client: Client, email: string, authorization: string) {
  const context = makeHttpContext().set(operationNameContext, 'customers.lookup')
  const [error, customer] = await client.execute(lookupCustomerRequest({ headers: { authorization }, query: { email } }), { context })
  if (error) throw error
  return customer
}

export async function main(): Promise<void> {
  // Step 4: Accept sensitive lookup inputs in a local fixture without logging them.
  let log: SafeRequestLog | undefined
  let time = 93
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const email = new URL(request.url).searchParams.get('email')
    if (!email || !request.headers.has('authorization')) throw new Error('fixture lookup is incomplete')
    return Response.json({ customerId: 'customer-1042' })
  }

  // Step 5: Run the lookup through the allowlisted request logger.
  const client = createClient(
    withEndpoint('https://customers.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(
      redactedRequestLogger(
        (entry) => (log = entry),
        () => (time += 7),
      ),
    ),
  )

  const customer = await lookupCustomer(client, 'alina.chen@example.invalid', 'Bearer fixture-customer-token')
  if (!log) throw new Error('request log was not written')

  // Step 6: Emit the validated customer and redacted metadata record.
  console.log(JSON.stringify({ customer, log }))
}

if (import.meta.main) {
  await main()
}
