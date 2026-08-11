import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Let native FormData own the boundary while Defjs types the evidence file and fixed purpose.
export const createRefundEvidence = defineRequest({
  method: 'POST',
  path: '/refund-evidence',
  input: struct.request({
    body: struct.formData({
      file: struct.file(),
      purpose: struct.literal('refund_evidence'),
    }),
  }),
  output: [{ status: 201, body: struct.object({ id: struct.string() }) }],
})

export const MAX_REFUND_EVIDENCE_BYTES = 5 * 1024 * 1024

// Step 2: Enforce the five MiB application limit before creating or dispatching the upload.
export async function uploadRefundEvidence(client: Client, file: File): Promise<string> {
  if (file.size > MAX_REFUND_EVIDENCE_BYTES) throw new RangeError('refund evidence exceeds the upload limit')
  const [error, evidence, response] = await client.execute(createRefundEvidence({ body: { file, purpose: 'refund_evidence' } }))
  if (error) throw error
  if (response.error) throw response.error
  return evidence.id
}

export async function main(): Promise<void> {
  // Step 3: Parse the native multipart body and record its file metadata.
  let received = { fileName: '', bytes: 0, purpose: '' }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const form = await request.formData()
    const file = form.get('file')
    const purpose = form.get('purpose')
    if (!(file instanceof File) || typeof purpose !== 'string') throw new Error('invalid multipart fixture request')
    received = { fileName: file.name, bytes: file.size, purpose }
    return new Response('{"id":"evidence-1042"}', {
      headers: { 'content-type': 'application/json' },
      status: 201,
    })
  }

  // Step 4: Upload the bounded receipt through the typed evidence operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const evidenceId = await uploadRefundEvidence(client, new File(['signed refund receipt'], 'receipt.txt', { type: 'text/plain' }))

  // Step 5: Emit the evidence ID, file size, name, and purpose.
  console.log(JSON.stringify({ evidenceId, ...received }))
}

if (import.meta.main) {
  await main()
}
