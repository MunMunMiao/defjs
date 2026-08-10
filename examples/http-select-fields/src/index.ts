import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Fix the employee projection and matching narrow Struct at the directory boundary.
export const getDirectoryUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.literal('id,displayName').alias('$select') }),
  }),
  output: [{ status: 200, body: struct.object({ id: struct.string(), displayName: struct.string() }) }] as const,
})

// Step 2: Return only the reviewed ID and display name even if the service sends extra fields.
export async function loadDirectoryUser(client: Client, id: string) {
  const [error, user] = await client.execute(getDirectoryUser({ path: { id }, query: { fields: 'id,displayName' } }))
  if (error) throw error
  return user
}

export async function main(): Promise<void> {
  // Step 3: Capture the fixed projection and return an over-complete directory body.
  let selected = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(new Request(input, init).url)
    selected = url.searchParams.get('$select') ?? ''
    return new Response(JSON.stringify({ id: 'employee-42', displayName: 'Ada Lovelace', mail: 'ada@company.invalid' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Load one employee through the narrow projected operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const user = await loadDirectoryUser(client, 'employee-42')

  // Step 5: Emit the selector and only the Struct-declared user fields.
  console.log(JSON.stringify({ select: selected, user }))
}

if (import.meta.main) {
  await main()
}
