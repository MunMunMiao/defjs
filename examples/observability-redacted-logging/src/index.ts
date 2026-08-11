import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  makeHttpContext,
  makeHttpContextToken,
  struct,
  type Client,
  type RequestError,
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
  output: [{ status: 200, body: struct.object({ customerId: struct.string() }) }],
})

export interface SafeRequestLog {
  durationMs: number
  method: string
  operation: CustomerOperation
  status: number | 'transport-error'
}

export type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
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
  if (error) throw toDiagnosticError(error)
  return customer
}

export async function main(): Promise<void> {
  // Step 4: Accept sensitive lookup inputs in a local fixture without logging them.
  let log: SafeRequestLog | undefined
  let time = 93
  const sensitiveAuthorization = 'Bearer fixture-customer-token'
  const sensitiveEmail = 'alina.chen@example.invalid'
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

  const customer = await lookupCustomer(client, sensitiveEmail, sensitiveAuthorization)
  if (!log) throw new Error('request log was not written')

  // Step 6: Exercise the diagnostic bridge without copying a response body or native cause message.
  const statusClient = createClient(
    withEndpoint('https://customers.invalid'),
    withHTTPHandle(async () => Response.json({ message: sensitiveEmail }, { status: 404 })),
  )
  const [statusError] = await statusClient.execute(
    defineRequest({
      method: 'GET',
      path: '/missing',
      output: [{ status: 404, body: struct.object({ message: struct.string() }) }],
    })(),
  )
  if (!statusError) throw new Error('expected an HTTP status error')
  const statusDiagnostic = toDiagnosticError(statusError)
  if (statusDiagnostic.kind !== 'http' || statusDiagnostic.code !== 'HTTP_STATUS' || statusDiagnostic.status !== 404) {
    throw new Error('diagnostic status classification was not preserved')
  }
  if (`${statusDiagnostic.message}\n${statusDiagnostic.stack}\n${JSON.stringify(statusDiagnostic)}`.includes(sensitiveEmail)) {
    throw new Error('diagnostic error leaked response data')
  }

  function createSensitiveCause() {
    const cause = new Error(sensitiveAuthorization)
    cause.stack = `Error: ${sensitiveAuthorization}\n    at https://customers.invalid/users?token=${sensitiveAuthorization}:1:1`
    return cause
  }
  const transportClient = createClient(
    withEndpoint('https://customers.invalid'),
    withHTTPHandle(async () => {
      throw createSensitiveCause()
    }),
  )
  const [transportError] = await transportClient.execute(
    lookupCustomerRequest({
      headers: { authorization: sensitiveAuthorization },
      query: { email: sensitiveEmail },
    }),
  )
  if (!transportError) throw new Error('expected a transport error')
  const transportDiagnostic = toDiagnosticError(transportError)
  if (
    transportDiagnostic.kind !== 'transport' ||
    transportDiagnostic.code !== 'NETWORK_ERROR' ||
    transportDiagnostic.status !== undefined ||
    !transportDiagnostic.stack ||
    transportDiagnostic.stack.includes(sensitiveAuthorization) ||
    transportDiagnostic.stack.includes('customers.invalid')
  ) {
    throw new Error('diagnostic transport classification or boundary stack was not safely preserved')
  }

  // Step 7: Emit the validated customer and redacted metadata record.
  console.log(JSON.stringify({ customer, log }))
}

if (import.meta.main) {
  await main()
}
