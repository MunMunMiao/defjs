import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
  withQueryParamsSerializer,
} from '@defjs/core'

// Step 1: Constrain the runner exchange to one OIDC route, audience query, and opaque token document.
export const requestActionsIDToken = defineRequest({
  method: 'GET',
  path: '/oidc',
  input: struct.request({ query: struct.object({ audience: struct.string() }) }),
  output: [{ status: 200, body: struct.object({ value: struct.string() }) }] as const,
})

// Step 2: Keep deployment code dependent on a validated opaque token rather than runner headers.
export async function fetchDeploymentIDToken(client: Client, audience: string): Promise<string> {
  const [error, document, response] = await client.execute(requestActionsIDToken({ query: { audience } }))
  if (error) throw error
  if (response.error) throw response.error
  return document.value
}

// Step 3: Pin the runner credential and inherited query state to the reviewed HTTPS OIDC endpoint.
function createRunnerOIDCClient(requestUrl: string, requestToken: string, trustedOrigin: string, handle: typeof fetch) {
  const endpoint = new URL(requestUrl)
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.origin !== trustedOrigin ||
    endpoint.pathname !== '/oidc' ||
    endpoint.searchParams.has('audience') ||
    requestToken === ''
  ) {
    throw new TypeError('invalid GitHub Actions OIDC environment')
  }
  const runnerQuery = new URLSearchParams(endpoint.search)
  const authorization = createHttpInterceptor((request, next) => {
    const target = new URL(request.endpoint, request.baseEndpoint)
    if (target.origin !== endpoint.origin || target.pathname !== endpoint.pathname) {
      throw new Error('runner credential is outside the OIDC endpoint')
    }
    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${requestToken}`)
    return next({ ...request, headers })
  })
  return createClient(
    withEndpoint(endpoint.origin),
    withHTTPHandle(handle),
    withQueryParamsSerializer((params) => {
      const merged = new URLSearchParams(runnerQuery)
      for (const [key, value] of params) merged.append(key, value)
      return merged.toString()
    }),
    withInterceptors(authorization),
  )
}

export async function main(): Promise<void> {
  // Step 4: Model a local runner that captures the reviewed audience and request ID.
  let audience = ''
  let requestId = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.headers.get('authorization') !== 'Bearer fixture-runner-token') {
      throw new Error('local runner did not receive its OIDC credential')
    }
    const url = new URL(request.url)
    audience = url.searchParams.get('audience') ?? ''
    requestId = url.searchParams.get('request_id') ?? ''
    return Response.json({ value: 'fixture.oidc.token' })
  }

  // Step 5: Request an opaque deployment token through the origin-scoped OIDC client.
  const client = createRunnerOIDCClient(
    'https://runner.invalid/oidc?request_id=release-1042',
    'fixture-runner-token',
    'https://runner.invalid',
    fixtureFetch,
  )

  await fetchDeploymentIDToken(client, 'https://deploy.example.invalid')

  // Step 6: Emit only non-secret request metadata after the token response validates.
  console.log(JSON.stringify({ audience, requestId }))
}

if (import.meta.main) {
  await main()
}
