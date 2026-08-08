import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Model payload_json as serialized text and keep the optional file absent when omitted.
export const createCaseNote = defineRequest({
  method: 'POST',
  path: '/case-notes',
  input: struct.request({
    body: struct.formData({
      payloadJson: struct.string().alias('payload_json'),
      file: struct.file().optional(),
    }),
  }),
  output: [{ status: 201, body: struct.object({ id: struct.string() }) }] as const,
})

// Step 2: Serialize case metadata once and return only a validated created-note ID.
export async function postCaseNote(client: Client, caseId: string, content: string, file?: File): Promise<string> {
  const payloadJson = JSON.stringify({ case_id: caseId, content })
  const [error, note, response] = await client.execute(createCaseNote({ body: { payloadJson, file } }))
  if (error) throw error
  if (response.error) throw response.error
  return note.id
}

export async function main(): Promise<void> {
  // Step 3: Decode payload_json and inspect optional file presence in the fixture.
  let received: { metadata: unknown; fileName: string | null } = { metadata: null, fileName: null }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const form = await new Request(input, init).formData()
    const payloadJson = form.get('payload_json')
    const file = form.get('file')
    if (typeof payloadJson !== 'string' || (file !== null && !(file instanceof File))) {
      throw new Error('invalid case note fixture request')
    }
    received = { metadata: JSON.parse(payloadJson), fileName: file?.name ?? null }
    return new Response('{"id":"note-483"}', {
      headers: { 'content-type': 'application/json' },
      status: 201,
    })
  }

  // Step 4: Post the case note without an attachment.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const noteId = await postCaseNote(client, 'case-483', 'No attachment required')

  // Step 5: Emit the note ID, decoded metadata, and absent file marker.
  console.log(JSON.stringify({ noteId, ...received }))
}

if (import.meta.main) {
  await main()
}
