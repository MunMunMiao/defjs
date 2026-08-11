import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Represent If-Match writes and typed 412 conflicts without weakening the opaque validator.
export const replaceCaseNote = defineRequest({
  method: 'PUT',
  path: '/v1/cases/:caseId/note',
  input: struct.request({
    path: struct.object({ caseId: struct.string() }),
    headers: struct.object({ etag: struct.string().alias('If-Match') }),
    body: struct.json(struct.object({ text: struct.string() })),
  }),
  output: [
    { status: 200, body: struct.object({ caseId: struct.string(), text: struct.string() }) },
    { status: 412, body: struct.object({ code: struct.literal('version_conflict') }) },
  ],
})

function isStrongEntityTag(value: string): boolean {
  return /^"[\x21\x23-\x7e]*"$/u.test(value)
}

// Step 2: Accept a note replacement only with strong ETags and turn stale writes into a refetch decision.
export async function saveCaseNoteIfCurrent(client: Client, caseId: string, etag: string, text: string) {
  if (!isStrongEntityTag(etag)) throw new TypeError('If-Match requires a strong entity-tag')

  const [error, note, response] = await client.execute(replaceCaseNote({ path: { caseId }, headers: { etag }, body: { text } }))
  if (error) {
    if (error.kind === 'http' && error.status === 412) return { kind: 'refetch-required' as const }
    throw error
  }
  if (response.error) throw response.error

  const nextEtag = response.headers.get('etag')
  if (!nextEtag || !isStrongEntityTag(nextEtag)) throw new Error('saved note is missing a strong ETag')
  return { etag: nextEtag, kind: 'saved' as const, note }
}

export async function main(): Promise<void> {
  // Step 3: Model a case note whose strong ETag advances after one accepted write.
  const state = { etag: '"note-v4"', text: 'Loading dock closes at 18:00' }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = (await request.json()) as { text: string }
    if (request.headers.get('if-match') !== state.etag) {
      return Response.json({ code: 'version_conflict' }, { status: 412 })
    }

    state.text = body.text
    state.etag = '"note-v5"'
    return Response.json({ caseId: 'case-204', text: state.text }, { headers: { etag: state.etag } })
  }

  // Step 4: Submit one current edit followed by an edit with the stale ETag.
  const client = createClient(withEndpoint('https://cases.invalid'), withHTTPHandle(fixtureFetch))
  const saved = await saveCaseNoteIfCurrent(client, 'case-204', '"note-v4"', 'Gate code is 7391')
  if (saved.kind !== 'saved') throw new Error('current note version was rejected')
  const stale = await saveCaseNoteIfCurrent(client, 'case-204', '"note-v4"', 'Gate code is 0000')

  // Step 5: Emit the validator transition and text that survived the stale write.
  console.log(
    JSON.stringify({
      saved: { etag: saved.etag },
      stale: stale.kind,
      persistedText: state.text,
    }),
  )
}

if (import.meta.main) {
  await main()
}
