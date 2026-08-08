import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Fix the Viewer document and type the GraphQL data/error envelope carried by HTTP 200.
export const VIEWER_QUERY = 'query Viewer { viewer { id login } }' as const
export const runViewerOperation = defineRequest({
  method: 'POST',
  path: '/graphql',
  input: struct.request({
    body: struct.json(
      struct.object({
        operationName: struct.literal('Viewer'),
        query: struct.literal(VIEWER_QUERY),
      }),
    ),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        data: struct.object({ viewer: struct.object({ id: struct.string(), login: struct.string() }).null() }).optional(),
        errors: struct.array(struct.object({ message: struct.string() })).optional(),
      }),
    },
  ] as const,
})

// Step 2: Reject operation errors or missing data before exposing the viewer.
export async function loadViewer(client: Client) {
  const [error, result, response] = await client.execute(runViewerOperation({ body: { operationName: 'Viewer', query: VIEWER_QUERY } }))
  if (error) throw error
  if (response.error) throw response.error
  if (result.errors?.length) throw new Error(result.errors.map(({ message }) => message).join('; '))
  if (!result.data) throw new Error('GraphQL response contained neither data nor errors')
  return result.data.viewer
}

export async function main(): Promise<void> {
  // Step 3: Return one data envelope and one error envelope from HTTP 200.
  let calls = 0
  const fixtureFetch: typeof fetch = async (input, init) => {
    await new Request(input, init).json()
    calls += 1
    const body =
      calls === 1 ? { data: { viewer: { id: 'viewer-1042', login: 'mina' } } } : { errors: [{ message: 'viewer temporarily unavailable' }] }
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Run the same viewer operation against both GraphQL outcomes.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const viewer = await loadViewer(client)
  let graphqlError = ''
  try {
    await loadViewer(client)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    graphqlError = error.message
  }

  // Step 5: Emit the accepted viewer and surfaced operation error.
  console.log(JSON.stringify({ viewer, graphqlError }))
}

if (import.meta.main) {
  await main()
}
