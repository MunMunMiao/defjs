import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Keep represented 200 and bodyless 204 deletion responses as distinct typed branches.
export const deleteExportJob = defineRequest({
  method: 'DELETE',
  path: '/export-jobs/:id',
  input: struct.request({ path: struct.object({ id: struct.string() }) }),
  output: [
    { status: 200, body: struct.object({ deleted: struct.boolean() }) },
    { status: 204, body: struct.null() },
  ] as const,
})

// Step 2: Normalize both successful branches without decoding content from 204.
export async function removeExportJob(client: Client, id: string) {
  const [error, result, response] = await client.execute(deleteExportJob({ path: { id: encodeURIComponent(id) } }))
  if (error) throw error
  if (response.status === 204) return { deleted: true as const, source: 'no-content' as const }
  if (!result?.deleted) throw new Error('export job deletion was not confirmed')
  return { deleted: true as const, source: 'representation' as const }
}

export async function main(): Promise<void> {
  // Step 3: Serve one represented deletion and one native bodyless 204.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const id = new URL(new Request(input, init).url).pathname.split('/').at(-1)
    if (id === 'export-expired') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ deleted: true }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Delete both export jobs through the same typed operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const removed = await removeExportJob(client, 'export-1042')
  const alreadyGone = await removeExportJob(client, 'export-expired')

  // Step 5: Emit the normalized outcomes for present and absent response bodies.
  console.log(JSON.stringify({ removed, alreadyGone }))
}

if (import.meta.main) {
  await main()
}
