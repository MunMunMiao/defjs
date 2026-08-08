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

const PAYROLL_ORIGIN = 'https://payroll.invalid'

// Step 1: Limit payroll access to one typed summary route and response.
export const readPayrollSummary = defineRequest({
  method: 'GET',
  path: '/payroll/summary',
  output: [
    { status: 200, body: struct.object({ employeeCount: struct.number(), period: struct.string() }) },
    { status: 401, body: struct.object({ code: struct.literal('invalid_payroll_token') }) },
  ] as const,
})

// Step 2: Keep payroll reads unaware of token rotation and authorization headers.
export async function loadPayrollSummary(client: Client) {
  const [error, summary, response] = await client.execute(readPayrollSummary())
  if (error) throw error
  if (response.error) throw response.error
  return summary
}

// Step 3: Resolve the current token at dispatch only after the request passes the payroll scope check.
export function payrollBearer(readToken: () => string) {
  return createHttpInterceptor((request, next) => {
    const target = new URL(request.endpoint, request.baseEndpoint)
    if (
      request.method !== 'GET' ||
      target.protocol !== 'https:' ||
      target.origin !== PAYROLL_ORIGIN ||
      target.pathname !== '/payroll/summary' ||
      target.search !== ''
    ) {
      throw new Error('Bearer credential is outside the reviewed payroll request')
    }

    const token = readToken()
    if (!token) throw new Error('payroll token is unavailable')
    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${token}`)
    return next({ ...request, headers })
  })
}

export async function main(): Promise<void> {
  // Step 4: Map accepted Bearer headers to safe token-version labels in the fixture.
  const tokenVersions = new Map([
    ['Bearer payroll-token-v1', 'v1'],
    ['Bearer payroll-token-v2', 'v2'],
  ])
  let tokenVersion = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const version = tokenVersions.get(request.headers.get('authorization') ?? '')
    if (!version) return Response.json({ code: 'invalid_payroll_token' }, { status: 401 })
    tokenVersion = version
    return Response.json({ employeeCount: 48, period: '2025-02' })
  }

  // Step 5: Rotate the token after client creation, then dispatch the scoped payroll read.
  let token = 'payroll-token-v1'
  const client = createClient(withEndpoint(PAYROLL_ORIGIN), withHTTPHandle(fixtureFetch), withInterceptors(payrollBearer(() => token)))
  token = 'payroll-token-v2'
  const summary = await loadPayrollSummary(client)

  // Step 6: Emit the payroll summary with the token version observed at Fetch.
  console.log(JSON.stringify({ ...summary, tokenVersion }))
}

if (import.meta.main) {
  await main()
}
