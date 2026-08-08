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

// Step 1: Bind repository reads to the reviewed GitHub API version and typed repository shape.
export const GITHUB_API_VERSION = '2022-11-28'
export const getRepository = defineRequest({
  method: 'GET',
  path: '/repos/:owner/:repository',
  input: struct.request({ path: struct.object({ owner: struct.string(), repository: struct.string() }) }),
  output: [{ status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) }] as const,
})

// Step 2: Expose validated repository data while version selection remains client policy.
export async function loadRepository(client: Client, owner: string, repository: string) {
  const [error, result] = await client.execute(
    getRepository({ path: { owner: encodeURIComponent(owner), repository: encodeURIComponent(repository) } }),
  )
  if (error) throw error
  return result
}

// Step 3: Set the reviewed version on every dispatched repository request.
export const githubApiVersion = createHttpInterceptor((request, next) => {
  const headers = new Headers(request.headers)
  headers.set('X-GitHub-Api-Version', GITHUB_API_VERSION)
  return next({ ...request, headers })
})

export async function main(): Promise<void> {
  // Step 4: Capture the final API version header in a local repository fixture.
  let version: string | null = null
  const fixtureFetch: typeof fetch = async (input, init) => {
    version = new Request(input, init).headers.get('X-GitHub-Api-Version')
    return new Response(JSON.stringify({ id: 841, name: 'ledger' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 5: Load the repository through the versioned client.
  const client = createClient(withEndpoint('https://fixture.invalid'), withInterceptors(githubApiVersion), withHTTPHandle(fixtureFetch))
  const repository = await loadRepository(client, 'acme-payments', 'ledger')

  // Step 6: Emit the observed version with the validated repository fields.
  console.log(JSON.stringify({ version, repository }))
}

if (import.meta.main) {
  await main()
}
