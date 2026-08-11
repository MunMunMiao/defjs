import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  makeResponse,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

// Step 1: Use one response Struct for support profiles returned by cache or origin.
export const getSupportAgent = defineRequest({
  method: 'GET',
  path: '/support/agents/:agentId',
  input: struct.request({ path: struct.object({ agentId: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.string(),
        displayName: struct.string(),
        source: struct.or(struct.literal('cache'), struct.literal('origin')),
      }),
    },
  ],
})

// Step 2: Keep profile lookup agnostic to which source satisfies the command.
export async function loadSupportAgent(client: Client, agentId: string) {
  const [error, profile, response] = await client.execute(getSupportAgent({ path: { agentId } }))
  if (error) throw error
  if (response.error) throw response.error
  return profile
}

// Step 3: Return this fixture's exact cache hit without transport; production authorization stays outside the shortcut and keys include principal, tenant, and Vary inputs.
export const serveCachedAgent = createHttpInterceptor(async (request, next) => {
  if (request.endpoint !== '/support/agents/agent-42') return next(request)

  return makeResponse({
    status: 200,
    body: { id: 'agent-42', displayName: 'Mina Park', source: 'cache' },
  })
})

export async function main(): Promise<void> {
  // Step 4: Provide a local origin for the one profile absent from cache.
  const fixtureFetch: typeof fetch = async () => Response.json({ id: 'agent-99', displayName: 'Theo Reed', source: 'origin' })

  // Step 5: Load one cache hit and one miss through the same client.
  const client = createClient(withEndpoint('https://support.invalid'), withHTTPHandle(fixtureFetch), withInterceptors(serveCachedAgent))

  const cachedProfile = await loadSupportAgent(client, 'agent-42')
  const originProfile = await loadSupportAgent(client, 'agent-99')

  // Step 6: Emit the independently validated cached and origin profiles.
  console.log(JSON.stringify({ cachedProfile, originProfile }))
}

if (import.meta.main) {
  await main()
}
