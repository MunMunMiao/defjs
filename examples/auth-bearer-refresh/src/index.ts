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

const BILLING_AUDIENCE = 'https://billing.invalid'

// Step 1: Bind each billing credential to one audience and tenant for the replayable invoice read.
export type BillingCredential = Readonly<{ accessToken: string; audience: string; tenant: string }>

export const readInvoiceAging = defineRequest({
  method: 'GET',
  path: '/v1/tenants/:tenant/invoice-aging',
  input: struct.request({ path: struct.object({ tenant: struct.string() }) }),
  output: [
    { status: 200, body: struct.object({ overdueInvoices: struct.number(), tenant: struct.string() }) },
    { status: 401, body: struct.object({ code: struct.literal('expired_token') }) },
  ] as const,
})

// Step 2: Expose invoice aging without leaking refresh or replay mechanics into callers.
export async function loadInvoiceAging(client: Client, tenant: string) {
  const [error, summary, response] = await client.execute(readInvoiceAging({ path: { tenant } }))
  if (error) throw error
  if (response.error) throw response.error
  return summary
}

// Step 3: Let each caller abort only its own wait while the shared credential refresh continues.
async function waitForRefresh<T>(flight: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return flight
  signal.throwIfAborted()

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? new DOMException('request cancelled', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void flight.then(
      (credential) => {
        cleanup()
        resolve(credential)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
  })
}

// Step 4: Own one refresh flight per stale credential and replay only the reviewed safe tenant read.
export function refreshingBearer(
  readCredential: () => BillingCredential,
  refreshCredential: (stale: BillingCredential) => Promise<BillingCredential>,
) {
  const refreshFlights = new Map<string, Promise<BillingCredential>>()

  return createHttpInterceptor(async (request, next) => {
    const target = new URL(request.endpoint, request.baseEndpoint)
    const match = /^\/v1\/tenants\/([^/]+)\/invoice-aging$/u.exec(target.pathname)
    if (
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      target.protocol !== 'https:' ||
      target.origin !== BILLING_AUDIENCE ||
      target.search !== '' ||
      !match?.[1]
    ) {
      throw new Error('Bearer credential is outside the reviewed billing read')
    }
    const tenant = decodeURIComponent(match[1])
    const validateScope = (credential: BillingCredential) => {
      if (!credential.accessToken || credential.audience !== target.origin || credential.tenant !== tenant) {
        throw new Error('billing credential scope does not match the request')
      }
      return credential
    }
    const authorize = (credential: BillingCredential) => {
      const headers = new Headers(request.headers)
      headers.set('authorization', `Bearer ${credential.accessToken}`)
      return { ...request, headers }
    }

    const used = validateScope(readCredential())
    const response = await next(authorize(used))
    const body = response.body
    if (response.status !== 401 || typeof body !== 'object' || body === null || !('code' in body) || body.code !== 'expired_token') {
      return response
    }

    const current = validateScope(readCredential())
    if (current.accessToken !== used.accessToken) return next(authorize(current))

    const key = JSON.stringify([used.accessToken, used.audience, used.tenant])
    let flight = refreshFlights.get(key)
    if (!flight) {
      flight = refreshCredential(used).finally(() => refreshFlights.delete(key))
      refreshFlights.set(key, flight)
    }
    const refreshed = validateScope(await waitForRefresh(flight, request.abort))
    return next(authorize(refreshed))
  })
}

export async function main(): Promise<void> {
  // Step 5: Hold two stale invoice reads behind a deterministic refresh barrier.
  let credential: BillingCredential = {
    accessToken: 'billing-token-v1',
    audience: BILLING_AUDIENCE,
    tenant: 'northwind',
  }
  let staleReads = 0
  let refreshes = 0
  const bothStale = Promise.withResolvers<void>()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.headers.get('authorization') === 'Bearer billing-token-v1') {
      staleReads++
      if (staleReads === 2) bothStale.resolve()
      return Response.json({ code: 'expired_token' }, { status: 401 })
    }
    return Response.json({ overdueInvoices: 7, tenant: 'northwind' })
  }

  // Step 6: Install one credential-scoped refresh flight and issue both safe reads.
  const bearer = refreshingBearer(
    () => credential,
    async () => {
      refreshes++
      await bothStale.promise
      credential = { ...credential, accessToken: 'billing-token-v2' }
      return credential
    },
  )
  const client = createClient(withEndpoint(BILLING_AUDIENCE), withHTTPHandle(fixtureFetch), withInterceptors(bearer))

  const [summary] = await Promise.all([loadInvoiceAging(client, 'northwind'), loadInvoiceAging(client, 'northwind')])

  // Step 7: Emit one typed summary and the single shared refresh count.
  console.log(JSON.stringify({ overdueInvoices: summary.overdueInvoices, refreshes }))
}

if (import.meta.main) {
  await main()
}
