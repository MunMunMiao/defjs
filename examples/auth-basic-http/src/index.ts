import {
  basicAuthHttpInterceptor,
  createClient,
  defineRequest,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

// Step 1: Separate the warehouse queue document from the typed authentication failure at the HTTP boundary.
export const readMorningPickQueue = defineRequest({
  method: 'GET',
  path: '/v1/pick-queues/morning',
  output: [
    { status: 200, body: struct.object({ openPickLists: struct.number(), warehouse: struct.string() }) },
    { status: 401, body: struct.object({ code: struct.literal('invalid_basic_credentials') }) },
  ] as const,
})

// Step 2: Return validated queue data while keeping reusable Basic credentials out of business code.
export async function loadMorningPickQueue(client: Client) {
  const [error, queue, response] = await client.execute(readMorningPickQueue())
  if (error) throw error
  if (response.error) throw response.error
  return queue
}

export async function main(): Promise<void> {
  // Step 3: Require the exact warehouse credential in an offline Fetch fixture.
  const expectedAuthorization = `Basic ${btoa('warehouse-reader:fixture-secret')}`
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.headers.get('authorization') !== expectedAuthorization) {
      return Response.json({ code: 'invalid_basic_credentials' }, { status: 401 })
    }
    return Response.json({ openPickLists: 3, warehouse: 'sea-1' })
  }

  // Step 4: Read the typed queue through an HTTPS client with scoped Basic authentication.
  const client = createClient(
    withEndpoint('https://warehouse.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(basicAuthHttpInterceptor(() => ({ username: 'warehouse-reader', password: 'fixture-secret' }))),
  )
  const queue = await loadMorningPickQueue(client)

  // Step 5: Emit only the validated warehouse queue, never the credential.
  console.log(JSON.stringify(queue))
}

if (import.meta.main) {
  await main()
}
